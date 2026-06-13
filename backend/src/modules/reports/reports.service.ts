import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { getScopedTenantId } from '../../common/helpers/tenant.helper';

@Injectable()
export class ReportsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Tenant scope. Owner-side can pass an override; tenant-side is auto-pinned. */
  private scope(user: AdminUser, overrideTenantId?: number): number | null {
    return getScopedTenantId(user, overrideTenantId);
  }

  /** Yearly totals (last `years` years, including current). */
  async yearly(user: AdminUser, years = 5, overrideTenantId?: number) {
    const tenantId = this.scope(user, overrideTenantId);
    if (tenantId === null) throw new ForbiddenException('لا يوجد عميل مرتبط بحسابك');
    const rows = await this.ds.query<Array<{ year: number; total_bytes: string }>>(`
      SELECT
        EXTRACT(YEAR FROM acctstarttime)::int AS year,
        COALESCE(SUM(acctinputoctets + acctoutputoctets), 0)::bigint AS total_bytes
      FROM radacct
      WHERE acctstarttime IS NOT NULL
        AND COALESCE(tenant_id, -1) = COALESCE($1, -1)
        AND acctstarttime >= NOW() - ($2 || ' years')::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `, [tenantId, String(years)]);
    return rows.map(r => ({ year: r.year, totalBytes: r.total_bytes }));
  }

  /** Monthly totals for a given year. Returns 12 rows (missing months show 0). */
  async monthly(user: AdminUser, year: number, overrideTenantId?: number) {
    const tenantId = this.scope(user, overrideTenantId);
    if (tenantId === null) throw new ForbiddenException('لا يوجد عميل مرتبط بحسابك');
    const rows = await this.ds.query<Array<{ month: number; total_bytes: string }>>(`
      SELECT
        EXTRACT(MONTH FROM acctstarttime)::int AS month,
        COALESCE(SUM(acctinputoctets + acctoutputoctets), 0)::bigint AS total_bytes
      FROM radacct
      WHERE acctstarttime IS NOT NULL
        AND COALESCE(tenant_id, -1) = COALESCE($1, -1)
        AND EXTRACT(YEAR FROM acctstarttime) = $2
      GROUP BY 1
      ORDER BY 1 ASC
    `, [tenantId, year]);
    // Fill missing months with zeros
    const byMonth = new Map(rows.map(r => [r.month, r.total_bytes]));
    return Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      totalBytes: byMonth.get(i + 1) ?? '0',
    }));
  }

  /** Subscribers that consumed bandwidth on a specific day, ordered by total
   *  bytes desc. Pulls first_name from user_profiles so the UI can label rows
   *  by the subscriber's real name. */
  async dailySubscribers(user: AdminUser, year: number, month: number, day: number, overrideTenantId?: number) {
    const tenantId = this.scope(user, overrideTenantId);
    if (tenantId === null) throw new ForbiddenException('لا يوجد عميل مرتبط بحسابك');
    const rows = await this.ds.query<Array<{ username: string; first_name: string | null; mobile: string | null; total_bytes: string; download_bytes: string; upload_bytes: string }>>(`
      SELECT
        ra.username,
        up.first_name,
        up.mobile,
        COALESCE(SUM(ra.acctinputoctets + ra.acctoutputoctets), 0)::bigint AS total_bytes,
        COALESCE(SUM(ra.acctoutputoctets), 0)::bigint AS download_bytes,
        COALESCE(SUM(ra.acctinputoctets),  0)::bigint AS upload_bytes
      FROM radacct ra
      LEFT JOIN user_profiles up
        ON up.username = ra.username
       AND COALESCE(up.tenant_id, -1) = COALESCE(ra.tenant_id, -1)
      WHERE ra.acctstarttime IS NOT NULL
        AND COALESCE(ra.tenant_id, -1) = COALESCE($1, -1)
        AND EXTRACT(YEAR  FROM ra.acctstarttime) = $2
        AND EXTRACT(MONTH FROM ra.acctstarttime) = $3
        AND EXTRACT(DAY   FROM ra.acctstarttime) = $4
      GROUP BY ra.username, up.first_name, up.mobile
      ORDER BY total_bytes DESC
    `, [tenantId, year, month, day]);
    return rows.map(r => ({
      username:      r.username,
      firstName:     r.first_name,
      mobile:        r.mobile,
      totalBytes:    r.total_bytes,
      downloadBytes: r.download_bytes,
      uploadBytes:   r.upload_bytes,
    }));
  }

  /** Daily totals for a given year+month. Returns one row per day in the month. */
  async daily(user: AdminUser, year: number, month: number, overrideTenantId?: number) {
    const tenantId = this.scope(user, overrideTenantId);
    if (tenantId === null) throw new ForbiddenException('لا يوجد عميل مرتبط بحسابك');
    const rows = await this.ds.query<Array<{ day: number; total_bytes: string }>>(`
      SELECT
        EXTRACT(DAY FROM acctstarttime)::int AS day,
        COALESCE(SUM(acctinputoctets + acctoutputoctets), 0)::bigint AS total_bytes
      FROM radacct
      WHERE acctstarttime IS NOT NULL
        AND COALESCE(tenant_id, -1) = COALESCE($1, -1)
        AND EXTRACT(YEAR FROM acctstarttime) = $2
        AND EXTRACT(MONTH FROM acctstarttime) = $3
      GROUP BY 1
      ORDER BY 1 ASC
    `, [tenantId, year, month]);
    const daysInMonth = new Date(year, month, 0).getDate();
    const byDay = new Map(rows.map(r => [r.day, r.total_bytes]));
    return Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      totalBytes: byDay.get(i + 1) ?? '0',
    }));
  }
}
