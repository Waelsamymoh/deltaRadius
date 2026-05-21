import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { VoucherCard } from '../../database/entities/voucher-card.entity';
import { Plan } from '../../database/entities/plan.entity';
import { RadCheck } from '../../database/entities/radcheck.entity';
import { RadUserGroup } from '../../database/entities/radusergroup.entity';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { getTenantId } from '../../common/helpers/tenant.helper';
import { GenerateCardsDto } from './dto/generate-cards.dto';
import { UpdateCardDto } from './dto/update-card.dto';

@Injectable()
export class VoucherCardsService {
  constructor(
    @InjectRepository(VoucherCard) private readonly cardRepo: Repository<VoucherCard>,
    @InjectRepository(Plan)        private readonly planRepo: Repository<Plan>,
    @InjectRepository(RadCheck)    private readonly radCheckRepo: Repository<RadCheck>,
    @InjectRepository(RadUserGroup) private readonly radUserGroupRepo: Repository<RadUserGroup>,
    private readonly dataSource: DataSource,
  ) {}

  async generate(dto: GenerateCardsDto, user: AdminUser): Promise<VoucherCard[]> {
    const tenantId = getTenantId(user);
    const plan = await this.planRepo.findOne({
      where: tenantId ? { id: dto.planId, tenantId } : { id: dto.planId },
    });
    if (!plan) throw new NotFoundException(`Plan ${dto.planId} not found`);

    const groupName = `plan-${plan.name.toLowerCase().replace(/\s+/g, '-')}`;
    const batchName = dto.batchName || `batch-${Date.now()}`;
    const now = new Date();

    // Get existing codes to avoid duplicates
    const existing: { code: string }[] = await this.dataSource.query(
      `SELECT code FROM voucher_cards${tenantId ? ` WHERE tenant_id = ${tenantId}` : ''}`,
    );

    // Generate codes in worker thread
    const codes: string[] = await this.generateInWorker(
      dto.quantity,
      dto.codeFormat,
      dto.codeLength,
      existing.map(r => r.code),
    );

    const cards: VoucherCard[] = [];

    await this.dataSource.transaction(async (m) => {
      for (const code of codes) {
        const expiresAt = dto.startMode === 'creation'
          ? new Date(now.getTime() + dto.durationDays * 86400_000)
          : null;

        const card = m.create(VoucherCard, {
          code,
          planId: plan.id,
          tenantId,
          batchName,
          status: 'unused',
          durationDays: dto.durationDays,
          startMode: dto.startMode,
          authMode: dto.authMode,
          expiresAt,
          note: dto.note ?? null,
        });
        const saved = await m.save(VoucherCard, card);
        cards.push(saved);

        // Insert into FreeRADIUS:
        //   authMode='both'           → Cleartext-Password = code  (user types it)
        //   authMode='username_only'  → Auth-Type=Accept           (no password)
        // FreeRADIUS needs the `Auth-Type Accept { ok }` handler we added in
        // sites-enabled/default for the second case to actually accept.
        const checkAttrs: any[] = [];
        if (dto.authMode === 'both') {
          checkAttrs.push({ username: code, attribute: 'Cleartext-Password', op: ':=', value: code, tenantId });
        } else {
          checkAttrs.push({ username: code, attribute: 'Auth-Type', op: ':=', value: 'Accept', tenantId });
        }
        if (expiresAt) {
          checkAttrs.push({ username: code, attribute: 'Expiration', op: ':=', value: this.formatExpiration(expiresAt), tenantId });
        }
        await m.save(RadCheck, checkAttrs);
        await m.save(RadUserGroup, { username: code, groupName, priority: 1, tenantId });
      }
    });

    return cards;
  }

  async findAll(
    user: AdminUser,
    filters: { status?: string; search?: string; planId?: number; page?: number; limit?: number },
  ): Promise<{ data: VoucherCard[]; total: number; page: number; limit: number }> {
    const tenantId = getTenantId(user);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.cardRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.plan', 'plan')
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (tenantId) qb.where('c.tenantId = :tenantId', { tenantId });
    else qb.where('c.tenantId IS NULL');

    if (filters.status)    qb.andWhere('c.status = :status', { status: filters.status });
    if (filters.planId)    qb.andWhere('c.planId = :planId', { planId: filters.planId });
    if (filters.search) {
      qb.andWhere('(c.code ILIKE :s OR c.batchName ILIKE :s OR plan.name ILIKE :s)', {
        s: `%${filters.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();

    // Fetch usage for these codes
    const codes = data.map(c => c.code);
    let usageMap: Record<string, { dl: string; ul: string }> = {};
    if (codes.length) {
      const usageRows: { username: string; dl: string; ul: string }[] = await this.dataSource.query(`
        SELECT
          ra.username,
          COALESCE(SUM(ra.acctoutputoctets), 0)::bigint AS dl,
          COALESCE(SUM(ra.acctinputoctets),  0)::bigint AS ul
        FROM radacct ra
        WHERE ra.username = ANY($1)
        GROUP BY ra.username
      `, [codes]);
      for (const r of usageRows) usageMap[r.username] = { dl: r.dl, ul: r.ul };
    }

    const enriched = data.map(c => ({
      ...c,
      usageDownloadBytes: usageMap[c.code]?.dl ?? '0',
      usageUploadBytes:   usageMap[c.code]?.ul ?? '0',
    }));

    return { data: enriched as any[], total, page, limit };
  }

  async update(id: number, dto: UpdateCardDto, user: AdminUser): Promise<VoucherCard> {
    const card = await this.findOne(id, user);
    const tenantId = getTenantId(user);

    if (dto.planId !== undefined && dto.planId !== card.planId) {
      const plan = await this.planRepo.findOne({
        where: tenantId ? { id: dto.planId, tenantId } : { id: dto.planId },
      });
      if (!plan) throw new NotFoundException(`Plan ${dto.planId} not found`);
      // Update radusergroup to new plan group
      const newGroup = `plan-${plan.name.toLowerCase().replace(/\s+/g, '-')}`;
      const w: any = tenantId ? { username: card.code, tenantId } : { username: card.code };
      await this.radUserGroupRepo.delete(w);
      await this.radUserGroupRepo.save({ username: card.code, groupName: newGroup, priority: 1, tenantId });
      card.planId = dto.planId;
      // Reset cumulative usage so the new plan's quota applies from zero
      await this.dataSource.query(
        `UPDATE user_data_usage
         SET total_download_bytes = 0, total_upload_bytes = 0,
             quota_reset_radacct_id = (SELECT COALESCE(MAX(radacctid),0) FROM radacct WHERE username = $1),
             updated_at = NOW()
         WHERE username = $1`,
        [card.code],
      );
    }

    if (dto.durationDays !== undefined) card.durationDays = dto.durationDays;
    if (dto.startMode    !== undefined) card.startMode    = dto.startMode;
    if (dto.batchName    !== undefined) card.batchName    = dto.batchName;
    if (dto.note         !== undefined) card.note         = dto.note;

    if (dto.expiresAt !== undefined) {
      const newExpiry = dto.expiresAt ? new Date(dto.expiresAt) : null;
      card.expiresAt = newExpiry;
      // Update Expiration in radcheck
      const w: any = tenantId ? { username: card.code, attribute: 'Expiration', tenantId } : { username: card.code, attribute: 'Expiration' };
      await this.radCheckRepo.delete(w);
      if (newExpiry) {
        await this.radCheckRepo.save({ username: card.code, attribute: 'Expiration', op: ':=', value: this.formatExpiration(newExpiry), tenantId });
      }
    }

    if (dto.authMode !== undefined && dto.authMode !== card.authMode) {
      card.authMode = dto.authMode;
      // Swap between Cleartext-Password (mode=both) and Auth-Type=Accept (username_only).
      const wPwd:  any = tenantId ? { username: card.code, attribute: 'Cleartext-Password', tenantId } : { username: card.code, attribute: 'Cleartext-Password' };
      const wAuth: any = tenantId ? { username: card.code, attribute: 'Auth-Type',          tenantId } : { username: card.code, attribute: 'Auth-Type' };
      await this.radCheckRepo.delete(wPwd);
      await this.radCheckRepo.delete(wAuth);
      if (dto.authMode === 'both') {
        await this.radCheckRepo.save({ username: card.code, attribute: 'Cleartext-Password', op: ':=', value: card.code, tenantId });
      } else {
        await this.radCheckRepo.save({ username: card.code, attribute: 'Auth-Type', op: ':=', value: 'Accept', tenantId });
      }
    }

    return this.cardRepo.save(card);
  }

  async getBatches(user: AdminUser) {
    const tenantId = getTenantId(user);
    const tid = tenantId ? `tenant_id = ${tenantId}` : 'tenant_id IS NULL';
    const rows = await this.dataSource.query(`
      SELECT
        vc.batch_name,
        COUNT(*)::int                                           AS total,
        COUNT(*) FILTER (WHERE vc.status = 'unused')::int      AS unused,
        COUNT(*) FILTER (WHERE vc.status = 'active')::int      AS active,
        COUNT(*) FILTER (WHERE vc.status = 'expired')::int     AS expired,
        COUNT(*) FILTER (WHERE vc.status = 'disabled')::int    AS disabled,
        MIN(vc.created_at)                                      AS created_at,
        vc.start_mode,
        vc.auth_mode,
        (SELECT p.name FROM plans p WHERE p.id = MIN(vc.plan_id) LIMIT 1) AS plan_name,
        MIN(vc.duration_days)                                   AS duration_days
      FROM voucher_cards vc
      WHERE ${tid}
      GROUP BY vc.batch_name, vc.start_mode, vc.auth_mode
      ORDER BY MIN(vc.created_at) DESC
    `);
    return rows.map((r: any) => ({
      batchName:   r.batch_name,
      total:       r.total,
      unused:      r.unused,
      active:      r.active,
      expired:     r.expired,
      disabled:    r.disabled,
      createdAt:   r.created_at,
      startMode:   r.start_mode,
      authMode:    r.auth_mode,
      planName:    r.plan_name,
      durationDays: r.duration_days,
    }));
  }

  async getBatchCards(batchName: string, user: AdminUser): Promise<VoucherCard[]> {
    const tenantId = getTenantId(user);
    return this.cardRepo.find({
      where: tenantId ? { batchName, tenantId } : { batchName },
      relations: ['plan'],
      order: { createdAt: 'ASC' },
    });
  }

  async removeByDateRange(from: Date, to: Date, user: AdminUser): Promise<{ deleted: number }> {
    const tenantId = getTenantId(user);
    const cards = await this.cardRepo
      .createQueryBuilder('c')
      .where(tenantId ? 'c.tenantId = :tenantId' : 'c.tenantId IS NULL', { tenantId })
      .andWhere('c.createdAt >= :from', { from })
      .andWhere('c.createdAt <= :to', { to })
      .getMany();

    if (!cards.length) return { deleted: 0 };

    await this.dataSource.transaction(async (m) => {
      for (const card of cards) {
        await this.removeFromRadiusManager(m, card.code, card.tenantId);
      }
      await m.remove(VoucherCard, cards);
    });

    return { deleted: cards.length };
  }

  async disableByDateRange(from: Date, to: Date, user: AdminUser): Promise<{ updated: number }> {
    const tenantId = getTenantId(user);
    const cards = await this.cardRepo
      .createQueryBuilder('c')
      .where(tenantId ? 'c.tenantId = :tenantId' : 'c.tenantId IS NULL', { tenantId })
      .andWhere('c.createdAt >= :from', { from })
      .andWhere('c.createdAt <= :to', { to })
      .andWhere("c.status != 'used'")
      .getMany();

    if (!cards.length) return { updated: 0 };

    await this.dataSource.transaction(async (m) => {
      for (const card of cards) {
        card.status = 'disabled';
        await m.save(VoucherCard, card);
        await this.removeFromRadiusManager(m, card.code, card.tenantId);
      }
    });

    return { updated: cards.length };
  }

  async disable(id: number, user: AdminUser): Promise<VoucherCard> {
    const card = await this.findOne(id, user);
    if (card.status === 'used') throw new BadRequestException('الكرت مستخدم بالفعل');
    card.status = 'disabled';
    await this.cardRepo.save(card);
    await this.removeFromRadius(card.code, card.tenantId);
    return card;
  }

  async remove(id: number, user: AdminUser): Promise<void> {
    const card = await this.findOne(id, user);
    await this.dataSource.transaction(async (m) => {
      await this.removeFromRadiusManager(m, card.code, card.tenantId);
      await m.remove(VoucherCard, card);
    });
  }

  async removeBatch(batchName: string, user: AdminUser): Promise<void> {
    const tenantId = getTenantId(user);
    const cards = await this.cardRepo.find({
      where: tenantId ? { batchName, tenantId } : { batchName },
    });
    await this.dataSource.transaction(async (m) => {
      for (const card of cards) {
        await this.removeFromRadiusManager(m, card.code, card.tenantId);
      }
      await m.remove(VoucherCard, cards);
    });
  }

  async activateFirstUseCards(): Promise<void> {
    const rows: { code: string; tenant_id: number | null; duration_days: number }[] =
      await this.dataSource.query(`
        SELECT vc.code, vc.tenant_id, vc.duration_days
        FROM voucher_cards vc
        WHERE vc.status = 'unused'
          AND vc.start_mode = 'first_use'
          AND EXISTS (
            SELECT 1 FROM radacct ra WHERE ra.username = vc.code LIMIT 1
          )
      `);

    for (const row of rows) {
      const expiresAt = new Date(Date.now() + row.duration_days * 86400_000);
      await this.dataSource.transaction(async (m) => {
        await m.query(`
          UPDATE voucher_cards SET status='active', activated_at=NOW(), expires_at=$1
          WHERE code=$2
        `, [expiresAt, row.code]);

        await m.query(`
          DELETE FROM radcheck WHERE username=$1 AND attribute='Expiration'
            AND COALESCE(tenant_id,-1)=COALESCE($2,-1)
        `, [row.code, row.tenant_id]);
        await m.save(RadCheck, {
          username: row.code,
          attribute: 'Expiration',
          op: ':=',
          value: this.formatExpiration(expiresAt),
          tenantId: row.tenant_id,
        });
      });
    }

    await this.dataSource.query(`
      UPDATE voucher_cards SET status='expired'
      WHERE status IN ('unused','active')
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
    `);
  }

  private generateInWorker(
    quantity: number,
    codeFormat: 'numbers' | 'letters' | 'alphanumeric',
    codeLength: number,
    existing: string[],
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'card-generator.worker.js');
      const worker = new Worker(workerPath, {
        workerData: { quantity, codeFormat, codeLength, existing },
      });
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
      });
    });
  }

  private async findOne(id: number, user: AdminUser): Promise<VoucherCard> {
    const tenantId = getTenantId(user);
    const where: any = tenantId ? { id, tenantId } : { id };
    const card = await this.cardRepo.findOne({ where });
    if (!card) throw new NotFoundException(`Card ${id} not found`);
    return card;
  }

  private async removeFromRadius(code: string, tenantId: number | null) {
    const w: any = tenantId ? { username: code, tenantId } : { username: code };
    await this.radCheckRepo.delete(w);
    await this.radUserGroupRepo.delete(w);
  }

  private async removeFromRadiusManager(m: any, code: string, tenantId: number | null) {
    const w: any = tenantId ? { username: code, tenantId } : { username: code };
    await m.delete(RadCheck, w);
    await m.delete(RadUserGroup, w);
  }

  private formatExpiration(date: Date): string {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2,'0')} ${date.getFullYear()}`;
  }
}
