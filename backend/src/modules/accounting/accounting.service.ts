import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, FindOptionsWhere, DataSource } from 'typeorm';
import { RadAcct } from '../../database/entities/radacct.entity';
import { RadPostAuth } from '../../database/entities/radpostauth.entity';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { getTenantId } from '../../common/helpers/tenant.helper';

/**
 * A session is "truly active" when:
 *   - no Acct-Stop packet has arrived (acctstoptime IS NULL), AND
 *   - the NAS sent an interim update recently (acctupdatetime within grace), OR
 *     the session just started and no update has arrived yet.
 * Otherwise it's a "stuck" session (NAS lost power / link without sending Stop)
 * and should NOT be counted as active.
 *
 * MikroTik interim-update is typically 10s–60s, so 10 minutes is a safe grace
 * window that still catches stuck sessions quickly.
 */
const ACTIVE_GRACE_MIN = 10;
const ACTIVE_CONDITION = `
  ra.acctstoptime IS NULL
  AND (
    ra.acctupdatetime > NOW() - INTERVAL '${ACTIVE_GRACE_MIN} minutes'
    OR (ra.acctupdatetime IS NULL AND ra.acctstarttime > NOW() - INTERVAL '${ACTIVE_GRACE_MIN} minutes')
  )
`;

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(RadAcct)
    private readonly radAcctRepo: Repository<RadAcct>,
    @InjectRepository(RadPostAuth)
    private readonly radPostAuthRepo: Repository<RadPostAuth>,
    private readonly dataSource: DataSource,
  ) {}

  // FreeRADIUS writes radacct with tenant_id = NULL always.
  // We resolve tenant ownership via user_profiles.
  private tenantUsernames(tenantId: number | null): string {
    if (!tenantId) return '';
    return `AND ra.username IN (SELECT username FROM user_profiles WHERE tenant_id = ${tenantId})`;
  }

  async findSessions(user: AdminUser, active?: boolean) {
    const tenantId = getTenantId(user);
    const tenantFilter = this.tenantUsernames(tenantId);

    if (active === true) {
      // One row per user: latest TRULY active session only (NAS interim updates still arriving)
      return this.dataSource.query(`
        SELECT DISTINCT ON (ra.username) ra.*
        FROM radacct ra
        WHERE ${ACTIVE_CONDITION} ${tenantFilter}
        ORDER BY ra.username, ra.acctstarttime DESC
      `);
    }

    // active === false → closed OR stuck (anything not "truly active")
    const activeFilter = active === false ? `AND NOT (${ACTIVE_CONDITION})` : '';
    return this.dataSource.query(`
      SELECT ra.* FROM radacct ra
      WHERE 1=1 ${tenantFilter} ${activeFilter}
      ORDER BY ra.acctstarttime DESC LIMIT 200
    `);
  }

  /**
   * Mark "stuck" sessions (no interim update for ACTIVE_GRACE_MIN minutes and
   * no Stop packet) as ended. Sets acctstoptime = acctupdatetime/acctstarttime
   * + 'Lost-Carrier' termination cause. Returns the count cleaned up.
   */
  async cleanupStaleSessions(user: AdminUser): Promise<{ closed: number }> {
    const tenantId = getTenantId(user);
    const tenantFilter = this.tenantUsernames(tenantId);
    const result = await this.dataSource.query(`
      UPDATE radacct ra SET
        acctstoptime        = COALESCE(ra.acctupdatetime, ra.acctstarttime),
        acctterminatecause  = 'Lost-Carrier'
      WHERE ra.acctstoptime IS NULL
        AND (
          (ra.acctupdatetime IS NOT NULL AND ra.acctupdatetime < NOW() - INTERVAL '${ACTIVE_GRACE_MIN} minutes')
          OR (ra.acctupdatetime IS NULL AND ra.acctstarttime < NOW() - INTERVAL '${ACTIVE_GRACE_MIN} minutes')
        )
        ${tenantFilter}
    `);
    return { closed: result[1] ?? 0 };
  }

  findAuthLogs(user: AdminUser) {
    const tenantId = getTenantId(user);
    return this.radPostAuthRepo.find({
      where: tenantId ? { tenantId } : {},
      order: { authDate: 'DESC' },
      take: 200,
    });
  }

  /** Return a list of months that have auth logs, with row counts */
  async authLogMonths(user: AdminUser): Promise<{ month: string; count: number }[]> {
    const tenantId = getTenantId(user);
    const tenantClause = tenantId ? `WHERE tenant_id = ${tenantId}` : '';
    const rows = await this.dataSource.query(`
      SELECT to_char(authdate, 'YYYY-MM') AS month, COUNT(*)::int AS count
      FROM radpostauth ${tenantClause}
      GROUP BY to_char(authdate, 'YYYY-MM')
      ORDER BY month DESC
    `);
    return rows.map((r: any) => ({ month: r.month, count: r.count }));
  }

  /** Delete all auth logs for a given YYYY-MM month (within tenant scope) */
  async deleteAuthLogsByMonth(user: AdminUser, month: string): Promise<{ deleted: number }> {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('Invalid month format — expected YYYY-MM');
    }
    const tenantId = getTenantId(user);
    const tenantClause = tenantId ? `AND tenant_id = ${tenantId}` : '';
    const result = await this.dataSource.query(`
      DELETE FROM radpostauth
      WHERE to_char(authdate, 'YYYY-MM') = $1 ${tenantClause}
    `, [month]);
    return { deleted: result[1] ?? 0 };
  }

  async stats(user: AdminUser) {
    const tenantId = getTenantId(user);
    const tenantFilter = this.tenantUsernames(tenantId);
    const rows = await this.dataSource.query(`
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(DISTINCT ra.username) FILTER (WHERE ${ACTIVE_CONDITION})    AS active
      FROM radacct ra
      WHERE 1=1 ${tenantFilter}
    `);
    return {
      totalSessions:  parseInt(rows[0]?.total  ?? '0'),
      activeSessions: parseInt(rows[0]?.active ?? '0'),
    };
  }

  async dashboardStats(user: AdminUser) {
    const tenantId = getTenantId(user);
    const tf = this.tenantUsernames(tenantId);
    const vcTf = tenantId ? `AND tenant_id = ${tenantId}` : '';
    const upTf = tenantId ? `AND tenant_id = ${tenantId}` : '';

    const [sessions, cards, subscribers, dailyData, topPlans] = await Promise.all([
      // Session & traffic summary — only "truly active" sessions (interim updates still arriving)
      this.dataSource.query(`
        SELECT
          COUNT(*) FILTER (WHERE ${ACTIVE_CONDITION})            AS active_sessions,
          COUNT(*)                                                AS total_sessions,
          COALESCE(SUM(acctinputoctets)  FILTER (WHERE ${ACTIVE_CONDITION}), 0) AS upload_bytes_active,
          COALESCE(SUM(acctoutputoctets) FILTER (WHERE ${ACTIVE_CONDITION}), 0) AS download_bytes_active,
          COALESCE(SUM(acctinputoctets),  0)                    AS total_upload_bytes,
          COALESCE(SUM(acctoutputoctets), 0)                    AS total_download_bytes
        FROM radacct ra
        WHERE 1=1 ${tf}
      `),

      // Voucher card status counts
      this.dataSource.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'unused')   AS unused,
          COUNT(*) FILTER (WHERE status = 'active')   AS active,
          COUNT(*) FILTER (WHERE status = 'expired')  AS expired,
          COUNT(*) FILTER (WHERE status = 'disabled') AS disabled,
          COUNT(*)                                     AS total
        FROM voucher_cards
        WHERE 1=1 ${vcTf}
      `),

      // Subscriber counts
      this.dataSource.query(`
        SELECT COUNT(*) AS total FROM user_profiles WHERE 1=1 ${upTf}
      `),

      // Last 7 days: sessions per day
      this.dataSource.query(`
        SELECT
          DATE(acctstarttime) AS day,
          COUNT(*)            AS sessions,
          COALESCE(SUM(acctinputoctets), 0)  AS upload_bytes,
          COALESCE(SUM(acctoutputoctets), 0) AS download_bytes
        FROM radacct ra
        WHERE acctstarttime >= NOW() - INTERVAL '7 days' ${tf}
        GROUP BY DATE(acctstarttime)
        ORDER BY day
      `),

      // Top 5 plans by truly active sessions
      this.dataSource.query(`
        SELECT
          COALESCE(p.name, 'غير محدد') AS plan_name,
          COUNT(*) AS active_count
        FROM radacct ra
        JOIN user_profiles up ON up.username = ra.username
        LEFT JOIN plans p ON p.id = up.plan_id
        WHERE ${ACTIVE_CONDITION} ${tf.replace('ra.username', 'up.username')}
        GROUP BY p.name
        ORDER BY active_count DESC
        LIMIT 5
      `),
    ]);

    const s = sessions[0];
    const c = cards[0];

    return {
      activeSessions:      parseInt(s.active_sessions  ?? '0'),
      totalSessions:       parseInt(s.total_sessions   ?? '0'),
      uploadBytesActive:   parseInt(s.upload_bytes_active   ?? '0'),
      downloadBytesActive: parseInt(s.download_bytes_active ?? '0'),
      totalUploadBytes:    parseInt(s.total_upload_bytes    ?? '0'),
      totalDownloadBytes:  parseInt(s.total_download_bytes  ?? '0'),
      totalSubscribers:    parseInt(subscribers[0]?.total   ?? '0'),
      cards: {
        unused:   parseInt(c.unused   ?? '0'),
        active:   parseInt(c.active   ?? '0'),
        expired:  parseInt(c.expired  ?? '0'),
        disabled: parseInt(c.disabled ?? '0'),
        total:    parseInt(c.total    ?? '0'),
      },
      dailyData: dailyData.map((r: { day: string; sessions: string; upload_bytes: string; download_bytes: string }) => ({
        day:           r.day,
        sessions:      parseInt(r.sessions     ?? '0'),
        uploadBytes:   parseInt(r.upload_bytes  ?? '0'),
        downloadBytes: parseInt(r.download_bytes ?? '0'),
      })),
      topPlans: topPlans.map((r: { plan_name: string; active_count: string }) => ({
        name:  r.plan_name,
        count: parseInt(r.active_count ?? '0'),
      })),
    };
  }
}
