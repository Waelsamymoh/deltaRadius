import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { getScopedTenantId } from '../../common/helpers/tenant.helper';

interface LogInput {
  user: AdminUser | null;
  tenantId: number | null;
  method?: string | null;
  path?: string | null;
  action: string;
  description: string;
  entityType?: string | null;
  entityKey?: string | null;
  metadata?: Record<string, any> | null;
  statusCode?: number | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /** Fire-and-forget — never block the request if the audit insert fails. */
  log(input: LogInput): void {
    const row = this.repo.create({
      tenantId: input.tenantId,
      adminId: input.user?.id ?? null,
      adminEmail: input.user?.email ?? null,
      adminName: input.user?.fullName ?? null,
      adminRole: input.user?.role ?? null,
      method: input.method ?? null,
      path: input.path ?? null,
      action: input.action,
      description: input.description,
      entityType: input.entityType ?? null,
      entityKey: input.entityKey ?? null,
      metadata: input.metadata ?? null,
      statusCode: input.statusCode ?? null,
      ipAddress: input.ipAddress ?? null,
    });
    this.repo.save(row).catch(e => this.logger.error(`audit log save failed: ${e?.message ?? e}`));
  }

  /** List logs for the caller's tenant. Full-access roles see everyone;
   *  tenant assistants see only their own actions. Substitutes subscriber
   *  usernames in descriptions with their real names (first_name) for
   *  readability — falls back to the username if the subscriber was deleted. */
  async list(
    user: AdminUser,
    overrideTenantId?: number,
    filters?: { adminId?: number; from?: string; to?: string; action?: string; limit?: number },
  ) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const qb = this.repo
      .createQueryBuilder('l')
      .orderBy('l.createdAt', 'DESC')
      .limit(filters?.limit ?? 200);

    if (tenantId !== null) qb.where('l.tenantId = :tid', { tid: tenantId });

    const isFullAccess =
      user.role === AdminRole.OWNER ||
      user.role === AdminRole.SUPERADMIN ||
      user.role === AdminRole.ADMIN;
    if (!isFullAccess) qb.andWhere('l.adminId = :uid', { uid: user.id });
    else if (filters?.adminId) qb.andWhere('l.adminId = :fid', { fid: filters.adminId });

    if (filters?.from)   qb.andWhere('l.createdAt >= :from',   { from: filters.from });
    if (filters?.to)     qb.andWhere('l.createdAt <  :to',     { to:   filters.to });
    if (filters?.action) qb.andWhere('l.action LIKE :a',       { a:    `${filters.action}%` });

    const logs = await qb.getMany();

    // Resolve subscriber usernames → first_name for the display description.
    const subscriberKeys = Array.from(new Set(
      logs
        .filter(l => l.entityType === 'subscriber' && l.entityKey)
        .map(l => l.entityKey!),
    ));
    if (subscriberKeys.length) {
      const rows: { username: string; first_name: string }[] = await this.repo.manager.query(
        `SELECT username, first_name FROM user_profiles
          WHERE username = ANY($1::text[])
            AND ${tenantId !== null ? 'COALESCE(tenant_id, -1) = COALESCE($2, -1)' : '1=1'}`,
        tenantId !== null ? [subscriberKeys, tenantId] : [subscriberKeys],
      );
      const nameMap = new Map(rows.map(r => [r.username, r.first_name]));
      for (const l of logs) {
        if (l.entityType === 'subscriber' && l.entityKey) {
          const name = nameMap.get(l.entityKey);
          if (name && l.description?.includes(l.entityKey)) {
            // String split/join avoids regex pitfalls when usernames contain
            // colons (MAC-style) or other regex meta-characters.
            l.description = l.description.split(l.entityKey).join(name);
            // Attach the resolved name so the frontend can highlight it.
            (l as any).subscriberName = name;
          }
        }
      }
    }
    return logs;
  }

  /** Distinct months that have audit log entries, with row counts, restricted
   *  to the caller's tenant scope. Used to power the per-month delete buttons. */
  async months(user: AdminUser, overrideTenantId?: number): Promise<{ month: string; count: number }[]> {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const tenantClause = tenantId !== null ? `WHERE tenant_id = ${tenantId}` : '';
    const rows = await this.repo.manager.query(`
      SELECT to_char(created_at, 'YYYY-MM') AS month, COUNT(*)::int AS count
        FROM audit_logs ${tenantClause}
       GROUP BY to_char(created_at, 'YYYY-MM')
       ORDER BY month DESC
    `);
    return rows.map((r: any) => ({ month: r.month, count: r.count }));
  }

  /** Delete every audit log row for a given YYYY-MM, restricted to the caller's
   *  tenant scope. Refuses any other month format so a stray query can't wipe
   *  unrelated rows. */
  async deleteByMonth(user: AdminUser, month: string, overrideTenantId?: number): Promise<{ deleted: number }> {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('Invalid month format — expected YYYY-MM');
    }
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const tenantClause = tenantId !== null ? `AND tenant_id = ${tenantId}` : '';
    const result = await this.repo.manager.query(`
      DELETE FROM audit_logs
       WHERE to_char(created_at, 'YYYY-MM') = $1 ${tenantClause}
    `, [month]);
    return { deleted: result[1] ?? 0 };
  }

  /** Per-admin summary: counts of actions, last activity. */
  async summary(user: AdminUser, overrideTenantId?: number, filters?: { from?: string; to?: string }) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const qb = this.repo
      .createQueryBuilder('l')
      .select('l.adminId',                'adminId')
      .addSelect('l.adminEmail',          'adminEmail')
      .addSelect('l.adminName',           'adminName')
      .addSelect('l.adminRole',           'adminRole')
      .addSelect('COUNT(*)::int',         'count')
      .addSelect('MAX(l.createdAt)',      'lastAt')
      .groupBy('l.adminId').addGroupBy('l.adminEmail').addGroupBy('l.adminName').addGroupBy('l.adminRole')
      .orderBy('"count"', 'DESC');

    if (tenantId !== null) qb.where('l.tenantId = :tid', { tid: tenantId });
    if (filters?.from)     qb.andWhere('l.createdAt >= :from', { from: filters.from });
    if (filters?.to)       qb.andWhere('l.createdAt <  :to',   { to:   filters.to });

    return qb.getRawMany<{ adminId: number; adminEmail: string; adminName: string | null; adminRole: string; count: number; lastAt: Date }>();
  }
}
