import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, FindOptionsWhere } from 'typeorm';
import { TopupPackage } from '../../database/entities/topup-package.entity';
import { UserTopup } from '../../database/entities/user-topup.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { Plan } from '../../database/entities/plan.entity';
import { RadCheck } from '../../database/entities/radcheck.entity';
import { RadReply } from '../../database/entities/radreply.entity';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { getTenantId } from '../../common/helpers/tenant.helper';
import { CreateTopupPackageDto, UpdateTopupPackageDto } from './dto/topup-package.dto';
import { QuotaEnforcerService } from '../quota/quota-enforcer.service';

const BYTES_PER_GB = 1024 * 1024 * 1024;
const GIGAWORD = 4294967296; // 2^32

@Injectable()
export class TopupsService {
  private readonly logger = new Logger(TopupsService.name);

  constructor(
    @InjectRepository(TopupPackage) private readonly pkgRepo: Repository<TopupPackage>,
    @InjectRepository(UserTopup)    private readonly topupRepo: Repository<UserTopup>,
    @InjectRepository(UserProfile)  private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(Plan)         private readonly planRepo: Repository<Plan>,
    @InjectRepository(RadCheck)     private readonly radCheckRepo: Repository<RadCheck>,
    @InjectRepository(RadReply)     private readonly radReplyRepo: Repository<RadReply>,
    private readonly dataSource: DataSource,
    private readonly quotaEnforcer: QuotaEnforcerService,
  ) {}

  // ── Packages CRUD ─────────────────────────────────────────────────────────

  private pkgWhere(tenantId: number | null, extra: any = {}): FindOptionsWhere<TopupPackage> {
    return (tenantId ? { tenantId, ...extra } : extra) as FindOptionsWhere<TopupPackage>;
  }

  listPackages(user: AdminUser) {
    return this.pkgRepo.find({ where: this.pkgWhere(getTenantId(user)), order: { sizeGb: 'ASC' } });
  }

  async getPackage(id: number, user: AdminUser) {
    const pkg = await this.pkgRepo.findOne({ where: this.pkgWhere(getTenantId(user), { id }) });
    if (!pkg) throw new NotFoundException(`Package ${id} not found`);
    return pkg;
  }

  createPackage(dto: CreateTopupPackageDto, user: AdminUser) {
    const tenantId = getTenantId(user);
    return this.pkgRepo.save(this.pkgRepo.create({
      name: dto.name,
      sizeGb: String(dto.sizeGb),
      price: String(dto.price ?? 0),
      description: dto.description ?? null,
      tenantId,
    }));
  }

  async updatePackage(id: number, dto: UpdateTopupPackageDto, user: AdminUser) {
    const pkg = await this.getPackage(id, user);
    if (dto.name        !== undefined) pkg.name        = dto.name;
    if (dto.sizeGb      !== undefined) pkg.sizeGb      = String(dto.sizeGb);
    if (dto.price       !== undefined) pkg.price       = String(dto.price);
    if (dto.description !== undefined) pkg.description = dto.description;
    return this.pkgRepo.save(pkg);
  }

  async deletePackage(id: number, user: AdminUser) {
    const pkg = await this.getPackage(id, user);
    await this.pkgRepo.remove(pkg);
    return { message: `Package '${pkg.name}' deleted` };
  }

  // ── Apply topup to a user ────────────────────────────────────────────────

  async applyToUser(username: string, packageId: number, admin: AdminUser): Promise<UserTopup> {
    const tenantId = getTenantId(admin);
    const pkg = await this.getPackage(packageId, admin);
    const profile = await this.profileRepo.findOne({
      where: tenantId ? { username, tenantId } : { username },
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);

    const sizeBytes = Math.floor(Number(pkg.sizeGb) * BYTES_PER_GB);

    let saved: UserTopup;
    let planToApply: Plan | null = null;

    await this.dataSource.transaction(async (m) => {
      // Insert topup record
      saved = await m.save(UserTopup, {
        username,
        tenantId,
        packageId: pkg.id,
        sizeGb: pkg.sizeGb,
        price: pkg.price,
        appliedBy: admin.id,
      });

      // Add to bonus pool
      const currentBonus = BigInt(profile.bonusRemainingBytes || '0');
      profile.bonusRemainingBytes = String(currentBonus + BigInt(sizeBytes));

      // If user was on fallback plan, restore the original plan
      if (profile.originalPlanId != null) {
        planToApply = await this.planRepo.findOne({
          where: tenantId ? { id: profile.originalPlanId, tenantId } : { id: profile.originalPlanId },
        });
        if (planToApply) {
          profile.planId = profile.originalPlanId;
          profile.originalPlanId = null;
        }
      }

      await m.save(UserProfile, profile);

      // Determine the plan whose attributes we'll write to FreeRADIUS
      const effectivePlan = planToApply ?? await this.planRepo.findOne({
        where: tenantId ? { id: profile.planId!, tenantId } : { id: profile.planId! },
      });
      if (!effectivePlan) return;

      // Rewrite radreply completely so MikroTik gets:
      //   - Speed (Mikrotik-Rate-Limit) from the effective plan
      //   - Framed-Pool / Session-Timeout
      //   - NEW data limits = plan_limit + bonus_remaining_bytes
      await m.delete(RadReply, tenantId ? { username, tenantId } : { username });
      const bonusBytes = BigInt(profile.bonusRemainingBytes || '0');
      for (const a of this.buildReplyAttrs(effectivePlan, bonusBytes)) {
        await m.save(RadReply, { username, ...a, tenantId });
      }

      // Update quota check attrs in radcheck (used by FreeRADIUS sqlcounter) = plan_limit + bonus
      await this.updateQuotaCheckAttrs(m, username, tenantId, effectivePlan, profile.bonusRemainingBytes);
    });

    // Send CoA so MikroTik picks up new limits (and speed, if restored)
    const bonusForCoA = BigInt(profile.bonusRemainingBytes || '0');
    if (planToApply) {
      this.quotaEnforcer.sendCoAForPlan(username, planToApply, bonusForCoA).catch(e => this.logger.error(e));
    } else {
      // Plan unchanged — only quota limits changed. Get current plan and CoA.
      const currentPlan = await this.planRepo.findOne({
        where: tenantId ? { id: profile.planId!, tenantId } : { id: profile.planId! },
      });
      if (currentPlan) {
        this.quotaEnforcer.sendCoAForPlan(username, currentPlan, bonusForCoA).catch(e => this.logger.error(e));
      }
    }

    this.logger.log(`Topup applied to ${username}: +${pkg.sizeGb}GB (package ${pkg.name})`);
    return saved!;
  }

  // ── User topup history ────────────────────────────────────────────────────

  async getUserTopups(username: string, user: AdminUser): Promise<UserTopup[]> {
    const tenantId = getTenantId(user);
    return this.topupRepo.find({
      where: tenantId ? { username, tenantId } : { username },
      order: { appliedAt: 'DESC' },
    });
  }

  // ── Renewal recompute ─────────────────────────────────────────────────────
  // Called from the renewal flow in radius-users.service. Given current consumed
  // bytes and the plan limit, computes how much of the bonus was used (= consumed
  // above the plan_limit) and reduces bonus_remaining_bytes accordingly. The
  // unused portion carries over to the next cycle.

  static computeBonusCarryover(consumedBytes: bigint, planLimitBytes: bigint, currentBonus: bigint): bigint {
    if (consumedBytes <= planLimitBytes) return currentBonus;
    const overage = consumedBytes - planLimitBytes;
    return overage >= currentBonus ? 0n : currentBonus - overage;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async updateQuotaCheckAttrs(
    m: any,
    username: string,
    tenantId: number | null,
    plan: Plan,
    bonusBytesStr: string,
  ) {
    const QUOTA_ATTRS = [
      'Mikrotik-Recv-Limit', 'Mikrotik-Recv-Limit-Gigawords',
      'Mikrotik-Xmit-Limit', 'Mikrotik-Xmit-Limit-Gigawords',
    ];
    // Delete existing
    for (const a of QUOTA_ATTRS) {
      await m.delete(RadCheck, tenantId ? { username, attribute: a, tenantId } : { username, attribute: a });
    }
    const bonus = BigInt(bonusBytesStr || '0');

    if (plan.downloadLimitGb && Number(plan.downloadLimitGb) > 0) {
      const planBytes = BigInt(Math.floor(Number(plan.downloadLimitGb) * BYTES_PER_GB));
      const total = planBytes + bonus;
      const giga = total / BigInt(GIGAWORD);
      const rem  = total % BigInt(GIGAWORD);
      if (rem > 0n) await m.save(RadCheck, { username, attribute: 'Mikrotik-Recv-Limit',           op: ':=', value: String(rem),  tenantId });
      if (giga > 0n) await m.save(RadCheck, { username, attribute: 'Mikrotik-Recv-Limit-Gigawords', op: ':=', value: String(giga), tenantId });
    }
    if (plan.uploadLimitGb && Number(plan.uploadLimitGb) > 0) {
      const planBytes = BigInt(Math.floor(Number(plan.uploadLimitGb) * BYTES_PER_GB));
      const total = planBytes + bonus;
      const giga = total / BigInt(GIGAWORD);
      const rem  = total % BigInt(GIGAWORD);
      if (rem > 0n) await m.save(RadCheck, { username, attribute: 'Mikrotik-Xmit-Limit',           op: ':=', value: String(rem),  tenantId });
      if (giga > 0n) await m.save(RadCheck, { username, attribute: 'Mikrotik-Xmit-Limit-Gigawords', op: ':=', value: String(giga), tenantId });
    }
  }

  private buildReplyAttrs(plan: Plan, bonusBytes: bigint = 0n): { attribute: string; op: string; value: string }[] {
    const attrs: { attribute: string; op: string; value: string }[] = [];
    const dl = Number(plan.downloadMbps ?? 0);
    const ul = Number(plan.uploadMbps ?? 0);
    const fmt = (n: number) => Number.isInteger(n) ? `${Math.round(n)}M` : `${Math.round(n * 1000)}k`;
    if (dl > 0 || ul > 0) {
      const base = `${fmt(ul)}/${fmt(dl)}`;
      let rateLimit = base;
      const bdl = Number(plan.burstDownloadMbps ?? 0);
      const bul = Number(plan.burstUploadMbps ?? 0);
      if (bdl > 0 && bul > 0) {
        const burst = `${fmt(bul)}/${fmt(bdl)}`;
        const threshold = `${fmt(Number(plan.burstThresholdUploadMbps ?? ul))}/${fmt(Number(plan.burstThresholdDownloadMbps ?? dl))}`;
        const time = String(plan.burstTimeSeconds ?? 8);
        rateLimit = `${base} ${burst} ${threshold} ${time}`;
      }
      attrs.push({ attribute: 'Mikrotik-Rate-Limit', op: '=', value: rateLimit });
    }
    if (plan.framedPool)        attrs.push({ attribute: 'Framed-Pool', op: '=', value: plan.framedPool });
    if (plan.sessionTimeoutMin) attrs.push({ attribute: 'Session-Timeout', op: '=', value: String(plan.sessionTimeoutMin * 60) });

    // Data limits = plan_limit + bonus (MikroTik enforces these directly)
    const GIGAWORD = 4294967296n;
    if (plan.downloadLimitGb && Number(plan.downloadLimitGb) > 0) {
      const total = BigInt(Math.floor(Number(plan.downloadLimitGb) * BYTES_PER_GB)) + bonusBytes;
      const giga = total / GIGAWORD;
      const rem  = total % GIGAWORD;
      if (rem > 0n)  attrs.push({ attribute: 'Mikrotik-Recv-Limit',           op: '=', value: String(rem)  });
      if (giga > 0n) attrs.push({ attribute: 'Mikrotik-Recv-Limit-Gigawords', op: '=', value: String(giga) });
    }
    if (plan.uploadLimitGb && Number(plan.uploadLimitGb) > 0) {
      const total = BigInt(Math.floor(Number(plan.uploadLimitGb) * BYTES_PER_GB)) + bonusBytes;
      const giga = total / GIGAWORD;
      const rem  = total % GIGAWORD;
      if (rem > 0n)  attrs.push({ attribute: 'Mikrotik-Xmit-Limit',           op: '=', value: String(rem)  });
      if (giga > 0n) attrs.push({ attribute: 'Mikrotik-Xmit-Limit-Gigawords', op: '=', value: String(giga) });
    }

    return attrs;
  }
}
