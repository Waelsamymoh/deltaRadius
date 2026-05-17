import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, FindOptionsWhere } from 'typeorm';
import { Plan } from '../../database/entities/plan.entity';
import { RadGroupReply } from '../../database/entities/radgroupreply.entity';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { getTenantId } from '../../common/helpers/tenant.helper';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { QuotaEnforcerService } from '../quota/quota-enforcer.service';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(RadGroupReply)
    private readonly groupReplyRepo: Repository<RadGroupReply>,
    private readonly dataSource: DataSource,
    private readonly quotaEnforcer: QuotaEnforcerService,
  ) {}

  private w(tenantId: number | null): FindOptionsWhere<Plan> {
    return (tenantId ? { tenantId } : {}) as FindOptionsWhere<Plan>;
  }

  findAll(user: AdminUser) {
    const tenantId = getTenantId(user);
    return this.planRepo.find({ where: this.w(tenantId), order: { name: 'ASC' } });
  }

  async findOne(id: number, user: AdminUser) {
    const tenantId = getTenantId(user);
    const where = tenantId ? { id, tenantId } : { id };
    const plan = await this.planRepo.findOne({ where: where as FindOptionsWhere<Plan> });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);
    return plan;
  }

  async create(dto: CreatePlanDto, user: AdminUser) {
    const tenantId = getTenantId(user);
    const plan = this.planRepo.create({ ...dto, tenantId });
    const saved = await this.planRepo.save(plan);
    await this.syncGroupReply(saved, tenantId);
    return saved;
  }

  async update(id: number, dto: UpdatePlanDto, user: AdminUser) {
    const plan = await this.findOne(id, user);
    const tenantId = getTenantId(user);
    Object.assign(plan, dto);
    const saved = await this.planRepo.save(plan);
    await this.syncGroupReply(saved, tenantId);
    // Push CoA to all active users on this plan (fire-and-forget)
    this.pushCoaToActivePlanUsers(saved, tenantId).catch(e => this.logger.error(e));
    return saved;
  }

  private async pushCoaToActivePlanUsers(plan: Plan, tenantId: number | null): Promise<void> {
    const tenantFilterUp = tenantId ? `AND up.tenant_id = ${tenantId}` : '';
    const tenantFilterVc = tenantId ? `AND vc.tenant_id = ${tenantId}` : '';
    const rows: { username: string; is_card: boolean }[] = await this.dataSource.query(`
      SELECT DISTINCT up.username, false AS is_card
      FROM user_profiles up
      JOIN radacct ra ON ra.username = up.username AND ra.acctstoptime IS NULL
      WHERE up.plan_id = $1 ${tenantFilterUp}
      UNION
      SELECT DISTINCT vc.code AS username, true AS is_card
      FROM voucher_cards vc
      JOIN radacct ra ON ra.username = vc.code AND ra.acctstoptime IS NULL
      WHERE vc.plan_id = $1 ${tenantFilterVc}
    `, [plan.id]);

    this.logger.log(`Plan '${plan.name}' updated — processing ${rows.length} active user(s)`);
    for (const { username, is_card } of rows) {
      try {
        if (is_card) {
          // Quota attributes (Mikrotik-Recv/Xmit-Limit) are auth-only in MikroTik.
          // Kick the card so it re-auths and picks up the new radgroupreply limits.
          await this.quotaEnforcer.kickUser(username);
          this.logger.log(`Kicked card ${username} to re-auth with new plan limits`);
        } else {
          await this.quotaEnforcer.sendCoAForPlan(username, plan);
        }
      } catch (e) {
        this.logger.error(`Plan update action failed for ${username}: ${e}`);
      }
    }
  }

  async remove(id: number, user: AdminUser) {
    const plan = await this.findOne(id, user);
    const tenantId = getTenantId(user);
    const groupName = this.groupName(plan.name);
    await this.dataSource.transaction(async (m) => {
      const where = tenantId ? { groupName, tenantId } : { groupName };
      await m.delete(RadGroupReply, where as FindOptionsWhere<RadGroupReply>);
      await m.remove(plan);
    });
    return { message: `Plan '${plan.name}' deleted` };
  }

  private groupName(planName: string): string {
    return `plan-${planName.toLowerCase().replace(/\s+/g, '-')}`;
  }

  private buildRateLimit(plan: Plan): string {
    const fmt = (n: number) => Number.isInteger(Number(n)) ? `${Math.round(Number(n))}M` : `${Math.round(Number(n) * 1000)}k`;
    const base = `${fmt(plan.uploadMbps!)}/${fmt(plan.downloadMbps!)}`;

    const hasBurst = plan.burstUploadMbps && plan.burstDownloadMbps;
    if (!hasBurst) return base;

    const burst     = `${fmt(plan.burstUploadMbps!)}/${fmt(plan.burstDownloadMbps!)}`;
    const threshold = `${fmt(plan.burstThresholdUploadMbps ?? plan.uploadMbps!)}/${fmt(plan.burstThresholdDownloadMbps ?? plan.downloadMbps!)}`;
    const time      = String(plan.burstTimeSeconds ?? 8);

    return `${base} ${burst} ${threshold} ${time}`;
  }

  private async syncGroupReply(plan: Plan, tenantId: number | null) {
    const groupName = this.groupName(plan.name);
    const where = tenantId ? { groupName, tenantId } : { groupName };

    await this.dataSource.transaction(async (m) => {
      await m.delete(RadGroupReply, where as FindOptionsWhere<RadGroupReply>);

      const attrs: Partial<RadGroupReply>[] = [];

      if (plan.downloadMbps && plan.uploadMbps) {
        attrs.push({
          groupName, tenantId,
          attribute: 'Mikrotik-Rate-Limit',
          op: ':=',
          value: this.buildRateLimit(plan),
        });
      }

      if (plan.sessionTimeoutMin) {
        attrs.push({
          groupName, tenantId,
          attribute: 'Session-Timeout',
          op: ':=',
          value: String(plan.sessionTimeoutMin * 60),
        });
      }

      if (plan.downloadLimitGb) {
        const bytes = Math.round(plan.downloadLimitGb * 1024 * 1024 * 1024);
        attrs.push({
          groupName, tenantId,
          attribute: 'Mikrotik-Xmit-Limit',
          op: ':=',
          value: String(bytes),
        });
      }

      if (plan.uploadLimitGb) {
        const bytes = Math.round(plan.uploadLimitGb * 1024 * 1024 * 1024);
        attrs.push({
          groupName, tenantId,
          attribute: 'Mikrotik-Recv-Limit',
          op: ':=',
          value: String(bytes),
        });
      }

      if (plan.framedPool) {
        attrs.push({
          groupName, tenantId,
          attribute: 'Framed-Pool',
          op: ':=',
          value: plan.framedPool,
        });
      }

      if (attrs.length) await m.save(RadGroupReply, attrs);
    });
  }
}
