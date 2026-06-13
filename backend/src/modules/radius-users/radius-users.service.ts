import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, FindOptionsWhere, IsNull } from 'typeorm';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as bcrypt from 'bcrypt';
const execAsync = promisify(exec);
import { RadCheck } from '../../database/entities/radcheck.entity';
import { RadReply } from '../../database/entities/radreply.entity';
import { RadUserGroup } from '../../database/entities/radusergroup.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { Plan } from '../../database/entities/plan.entity';
import { Nas } from '../../database/entities/nas.entity';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { CreateRadiusUserDto } from './dto/create-user.dto';
import { UpdateRadiusUserDto } from './dto/update-user.dto';
import { getScopedTenantId } from '../../common/helpers/tenant.helper';
import { QuotaEnforcerService } from '../quota/quota-enforcer.service';

@Injectable()
export class RadiusUsersService {
  private readonly logger = new Logger(RadiusUsersService.name);

  constructor(
    @InjectRepository(RadCheck)
    private readonly radCheckRepo: Repository<RadCheck>,
    @InjectRepository(RadReply)
    private readonly radReplyRepo: Repository<RadReply>,
    @InjectRepository(RadUserGroup)
    private readonly radUserGroupRepo: Repository<RadUserGroup>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(Nas)
    private readonly nasRepo: Repository<Nas>,
    private readonly dataSource: DataSource,
    private readonly quotaEnforcer: QuotaEnforcerService,
  ) {}

  // Always scope by tenant — uses IS NULL when tenantId is null so we never
  // accidentally touch another tenant's rows in destructive queries.
  private w<T>(tenantId: number | null, extra: Partial<T> = {}): FindOptionsWhere<T> {
    const tid = tenantId !== null ? tenantId : IsNull();
    return { tenantId: tid, ...extra } as FindOptionsWhere<T>;
  }

  /** `expiryTime` is "HH:MM" (24h). Defaults to "12:00" so legacy callers
   *  that don't know about the tenant setting still get a noon expiry. */
  private expirationDate(startDate: string, durationDays: number, expiryTime: string = '12:00'): string {
    const d = new Date(startDate);
    d.setDate(d.getDate() + durationDays);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2,'0')} ${d.getFullYear()} ${expiryTime}:00`;
  }

  /** Look up the tenant's configured expiry time-of-day. Returns "12:00" if
   *  no tenant scope (owner-wide rows) or column is missing. */
  private async getTenantExpiryTime(tenantId: number | null): Promise<string> {
    if (!tenantId) return '12:00';
    const t = await this.dataSource
      .getRepository('tenants')
      .createQueryBuilder('t')
      .where('t.id = :id', { id: tenantId })
      .select('t.default_expiry_time', 'tm')
      .getRawOne<{ tm: string | null }>();
    return t?.tm ?? '12:00';
  }

  private buildReplyAttrs(plan: Plan): { attribute: string; op: string; value: string }[] {
    const attrs: { attribute: string; op: string; value: string }[] = [];

    if (plan.downloadMbps && plan.uploadMbps) {
      const fmt = (n: number) => Number.isInteger(Number(n)) ? `${Math.round(Number(n))}M` : `${Math.round(Number(n) * 1000)}k`;
      const base = `${fmt(Number(plan.uploadMbps))}/${fmt(Number(plan.downloadMbps))}`;
      let rateLimit = base;
      if (plan.burstUploadMbps && plan.burstDownloadMbps) {
        const burst     = `${fmt(Number(plan.burstUploadMbps))}/${fmt(Number(plan.burstDownloadMbps))}`;
        const threshold = `${fmt(Number(plan.burstThresholdUploadMbps ?? plan.uploadMbps))}/${fmt(Number(plan.burstThresholdDownloadMbps ?? plan.downloadMbps))}`;
        const time      = String(plan.burstTimeSeconds ?? 8);
        rateLimit = `${base} ${burst} ${threshold} ${time}`;
      }
      attrs.push({ attribute: 'Mikrotik-Rate-Limit', op: '=', value: rateLimit });
    }

    if (plan.sessionTimeoutMin) {
      attrs.push({
        attribute: 'Session-Timeout',
        op: '=',
        value: String(plan.sessionTimeoutMin * 60),
      });
    }

    if (plan.framedPool) {
      attrs.push({ attribute: 'Framed-Pool', op: '=', value: plan.framedPool });
    }

    if (plan.downloadLimitGb && Number(plan.downloadLimitGb) > 0) {
      const bytes = Math.floor(Number(plan.downloadLimitGb) * 1024 * 1024 * 1024);
      const giga  = Math.floor(bytes / 4294967296);
      const rem   = bytes % 4294967296;
      // Only add if rem > 0 (0 means unlimited in MikroTik)
      if (rem > 0)
        attrs.push({ attribute: 'Mikrotik-Recv-Limit',           op: '=', value: String(rem) });
      if (giga > 0)
        attrs.push({ attribute: 'Mikrotik-Recv-Limit-Gigawords', op: '=', value: String(giga) });
    }

    if (plan.uploadLimitGb && Number(plan.uploadLimitGb) > 0) {
      const bytes = Math.floor(Number(plan.uploadLimitGb) * 1024 * 1024 * 1024);
      const giga  = Math.floor(bytes / 4294967296);
      const rem   = bytes % 4294967296;
      if (rem > 0)
        attrs.push({ attribute: 'Mikrotik-Xmit-Limit',           op: '=', value: String(rem) });
      if (giga > 0)
        attrs.push({ attribute: 'Mikrotik-Xmit-Limit-Gigawords', op: '=', value: String(giga) });
    }

    return attrs;
  }

  // Check attributes for FreeRADIUS sqlcounter — quota limits must live in radcheck
  // so noresetdowncounter can find them and block reconnection when quota is exhausted.
  private buildQuotaCheckAttrs(plan: Plan): { attribute: string; op: string; value: string }[] {
    const attrs: { attribute: string; op: string; value: string }[] = [];
    if (plan.downloadLimitGb && Number(plan.downloadLimitGb) > 0) {
      const bytes = Math.floor(Number(plan.downloadLimitGb) * 1024 * 1024 * 1024);
      const giga  = Math.floor(bytes / 4294967296);
      const rem   = bytes % 4294967296;
      if (rem > 0)
        attrs.push({ attribute: 'Mikrotik-Recv-Limit',           op: ':=', value: String(rem) });
      if (giga > 0)
        attrs.push({ attribute: 'Mikrotik-Recv-Limit-Gigawords', op: ':=', value: String(giga) });
    }
    if (plan.uploadLimitGb && Number(plan.uploadLimitGb) > 0) {
      const bytes = Math.floor(Number(plan.uploadLimitGb) * 1024 * 1024 * 1024);
      const giga  = Math.floor(bytes / 4294967296);
      const rem   = bytes % 4294967296;
      if (rem > 0)
        attrs.push({ attribute: 'Mikrotik-Xmit-Limit',           op: ':=', value: String(rem) });
      if (giga > 0)
        attrs.push({ attribute: 'Mikrotik-Xmit-Limit-Gigawords', op: ':=', value: String(giga) });
    }
    return attrs;
  }

  private readonly QUOTA_CHECK_ATTRIBUTES = [
    'Mikrotik-Recv-Limit', 'Mikrotik-Recv-Limit-Gigawords',
    'Mikrotik-Xmit-Limit', 'Mikrotik-Xmit-Limit-Gigawords',
  ];

  private buildQuotaCheckAttrsWithBonus(plan: Plan, bonusBytes: bigint): { attribute: string; op: string; value: string }[] {
    const GIGAWORD = 4294967296n;
    const out: { attribute: string; op: string; value: string }[] = [];
    if (plan.downloadLimitGb && Number(plan.downloadLimitGb) > 0) {
      const total = BigInt(Math.floor(Number(plan.downloadLimitGb) * 1024 ** 3)) + bonusBytes;
      const giga = total / GIGAWORD;
      const rem  = total % GIGAWORD;
      if (rem > 0n)  out.push({ attribute: 'Mikrotik-Recv-Limit',           op: ':=', value: String(rem)  });
      if (giga > 0n) out.push({ attribute: 'Mikrotik-Recv-Limit-Gigawords', op: ':=', value: String(giga) });
    }
    if (plan.uploadLimitGb && Number(plan.uploadLimitGb) > 0) {
      const total = BigInt(Math.floor(Number(plan.uploadLimitGb) * 1024 ** 3)) + bonusBytes;
      const giga = total / GIGAWORD;
      const rem  = total % GIGAWORD;
      if (rem > 0n)  out.push({ attribute: 'Mikrotik-Xmit-Limit',           op: ':=', value: String(rem)  });
      if (giga > 0n) out.push({ attribute: 'Mikrotik-Xmit-Limit-Gigawords', op: ':=', value: String(giga) });
    }
    return out;
  }

  private sendRadiusPacket(
    type: 'disconnect' | 'coa',
    nasIp: string,
    secret: string,
    attrs: string,
  ): Promise<'ack' | 'nak-notfound' | 'nak-other' | 'noreply'> {
    return new Promise((resolve) => {
      const proc = spawn('radclient', ['-t', '3', '-r', '1', `${nasIp}:3799`, type, secret]);
      let out = '';
      proc.stdin.write(attrs);
      proc.stdin.end();
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.stderr.on('data', (d) => { out += d.toString(); });
      proc.on('close', () => {
        if (out.includes('-ACK'))                         resolve('ack');
        else if (out.includes('Session-Context-Not-Found')) resolve('nak-notfound');
        else if (out.includes('-NAK'))                    resolve('nak-other');
        else resolve('noreply');
      });
      proc.on('error', () => resolve('noreply'));
    });
  }

  private async sendCoA(username: string, plan: Plan, startDate?: string, durationDays?: number, tenantId?: number | null): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT nasipaddress, framedipaddress, acctsessionid FROM radacct
       WHERE username = $1 AND acctstoptime IS NULL
         AND COALESCE(tenant_id,-1) = COALESCE($2,-1)
       ORDER BY acctstarttime DESC LIMIT 1`,
      [username, tenantId ?? null],
    );
    if (!rows.length) return;

    const sessionNasIp: string = (rows[0].nasipaddress as string).split('/')[0];
    const framedIp: string     = (rows[0].framedipaddress as string).split('/')[0];
    const sessionId: string    = rows[0].acctsessionid;

    const replyAttrs = this.buildReplyAttrs(plan);

    // If duration provided and plan has no session timeout, inject remaining seconds
    if (startDate && durationDays && !plan.sessionTimeoutMin) {
      const expiry = new Date(startDate);
      expiry.setDate(expiry.getDate() + durationDays);
      const remainingSecs = Math.max(0, Math.floor((expiry.getTime() - Date.now()) / 1000));
      if (remainingSecs > 0) {
        replyAttrs.push({ attribute: 'Session-Timeout', op: ':=', value: String(remainingSecs) });
      }
    }

    const attrLines = replyAttrs.map(a => `${a.attribute} ${a.op} "${a.value}"`).join('\n');
    const attrs = `User-Name = "${username}"\nAcct-Session-Id = "${sessionId}"\nFramed-IP-Address = ${framedIp}${attrLines ? '\n' + attrLines : ''}`;
    this.logger.log(`CoA → ${username} @ ${sessionNasIp} (${replyAttrs.length} attrs): ${replyAttrs.map(a => `${a.attribute}=${a.value}`).join(', ')}`);

    const allNas = await this.nasRepo.find(tenantId ? { where: { tenantId } } : undefined);
    const seen = new Set<string>();
    const candidates: { ip: string; secret: string }[] = [];
    const add = (ip: string, secret: string) => {
      const clean = ip.split('/')[0];
      if (!seen.has(clean)) { seen.add(clean); candidates.push({ ip: clean, secret }); }
    };
    const exact = allNas.find(n => n.nasname.split('/')[0] === sessionNasIp);
    if (exact) add(exact.nasname, exact.secret);
    add(sessionNasIp, allNas[0]?.secret ?? 'testing123');
    for (const n of allNas) add(n.nasname, n.secret);

    for (const { ip, secret } of candidates) {
      const result = await this.sendRadiusPacket('coa', ip, secret, attrs);
      this.logger.log(`CoA result for ${username} @ ${ip}: ${result}`);
      if (result === 'ack') return;
      if (result === 'nak-notfound') break;
    }
    this.logger.warn(`CoA failed for ${username}: no ACK from any NAS`);
  }

  /** Public: route handler — resolves tenant scope from the caller, then kicks. */
  async kickByUser(username: string, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    return this.kickUser(username, tenantId);
  }

  async kickUser(username: string, tenantId?: number | null): Promise<{ kicked: boolean; message: string }> {
    const rows = await this.dataSource.query(
      `SELECT nasipaddress, framedipaddress, acctsessionid FROM radacct
       WHERE username = $1 AND acctstoptime IS NULL
         AND COALESCE(tenant_id,-1) = COALESCE($2,-1)
       ORDER BY acctstarttime DESC LIMIT 1`,
      [username, tenantId ?? null],
    );
    if (!rows.length) return { kicked: false, message: 'لا توجد جلسة نشطة' };

    const sessionNasIp: string  = (rows[0].nasipaddress  as string).split('/')[0];
    const framedIp: string      = (rows[0].framedipaddress as string).split('/')[0];
    const sessionId: string     = rows[0].acctsessionid;

    // Build ordered list of NAS IPs to try — restricted to this tenant when known
    const allNas = await this.nasRepo.find(tenantId ? { where: { tenantId } } : undefined);
    const seen = new Set<string>();
    const candidates: { ip: string; secret: string }[] = [];

    const add = (ip: string, secret: string) => {
      const clean = ip.split('/')[0];
      if (!seen.has(clean)) { seen.add(clean); candidates.push({ ip: clean, secret }); }
    };

    // Exact match on NAS-IP-Address from session first
    const exact = allNas.find(n => n.nasname.split('/')[0] === sessionNasIp);
    if (exact) add(exact.nasname, exact.secret);

    // Then try the raw session NAS-IP with any matching secret
    add(sessionNasIp, allNas[0]?.secret ?? 'testing123');

    // Then all configured NAS IPs (MikroTik may use management IP != NAS-IP in accounting)
    for (const n of allNas) add(n.nasname, n.secret);

    // Build attribute sets to try (MikroTik works best with Framed-IP-Address)
    const attrSets = [
      // Best: User-Name + Framed-IP-Address
      `User-Name = "${username}"\nFramed-IP-Address = ${framedIp}`,
      // Fallback: just Framed-IP-Address (MikroTik PPPoE/Hotspot)
      `Framed-IP-Address = ${framedIp}`,
      // Last resort: User-Name + Acct-Session-Id
      `User-Name = "${username}"\nAcct-Session-Id = "${sessionId}"`,
    ];

    for (const { ip, secret } of candidates) {
      for (const attrs of attrSets) {
        const result = await this.sendRadiusPacket('disconnect', ip, secret, attrs);
        if (result === 'ack') return { kicked: true, message: 'تم طرد المستخدم بنجاح' };
        if (result === 'nak-notfound') break; // this NAS doesn't have the session, try next NAS
        // nak-other or noreply: try next attr set
      }
    }

    return {
      kicked: false,
      message: 'لا يوجد رد من أجهزة الشبكة — تأكد من تفعيل CoA: /radius incoming set accept=yes port=3799',
    };
  }

  async findAll(
    user: AdminUser,
    overrideTenantId?: number,
    status: 'online' | 'active' | 'suspended' | 'archived' | 'all' = 'active',
    search?: string,
  ) {
    const tenantId = getScopedTenantId(user, overrideTenantId);

    // Supervisors flagged with `users.hide_list` see no subscribers until they
    // explicitly type a search term — enforced server-side so direct API calls
    // can't bypass the UI restriction.
    const perms = user.permissions ?? [];
    const listHidden = perms.includes('users.hide_list');
    const searchQuery = (search ?? '').trim();
    if (listHidden && !searchQuery) return [];
    // Minimum 4 chars to start searching — avoids returning huge result sets
    // for over-broad single/double-digit queries (e.g. "0" matching everyone).
    if (searchQuery && searchQuery.length < 4) return [];

    // Live-sync usage so the list reflects the latest accounting bytes
    await this.quotaEnforcer.syncAllUsage().catch(() => {});

    // Build status-based WHERE clauses. Each status is strictly disjoint so
    // a subscriber appears in exactly one of {active, suspended, archived}.
    // "online" narrows further to those with an open radacct session — filtered
    // post-fetch since isOnline is computed from radacct, not user_profiles.
    // "all" returns everything including archived.
    const statusWhere = (qb: any) => {
      if (status === 'archived')  return qb.andWhere('p.is_archived = true');
      if (status === 'suspended') return qb.andWhere('p.is_suspended = true AND p.is_archived = false');
      if (status === 'all')       return qb;
      // default 'active' / 'online' → not archived AND not suspended
      return qb.andWhere('p.is_archived = false AND p.is_suspended = false');
    };

    let profiles;
    if (tenantId) {
      const qb = this.profileRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.plan', 'plan')
        .where('p.tenantId = :tenantId', { tenantId })
        .orderBy('p.createdAt', 'DESC');
      profiles = await statusWhere(qb).getMany();
    } else {
      // Owner-side: all tenants (except archived tenants)
      const qb = this.profileRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.plan', 'plan')
        .leftJoinAndSelect('p.tenant', 'tenant')
        .where('(tenant.is_archived = false OR tenant.id IS NULL)')
        .orderBy('p.tenantId', 'ASC')
        .addOrderBy('p.createdAt', 'DESC');
      profiles = await statusWhere(qb).getMany();
    }

    // Server-side search filter — required for supervisors with `users.hide_list`
    // so the API never leaks the full subscriber list. Cheap enough to apply
    // for everyone when a search term is supplied.
    if (searchQuery) {
      // Normalise Arabic-Indic (٠-٩) and Persian (۰-۹) digits to English so
      // a user typing "٠١٠" on an Arabic keyboard still matches "010" in DB.
      const normDigits = (s: string) => s
        .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
        .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48));
      const q = normDigits(searchQuery).toLowerCase();
      profiles = profiles.filter(p =>
        p.username.toLowerCase().includes(q) ||
        (p.firstName ?? '').toLowerCase().includes(q) ||
        normDigits(p.mobile ?? '').includes(q)
      );
    }

    // bulk fetch usage from user_data_usage (cumulative, persists across sessions) — per tenant
    const usernames = profiles.map(p => p.username);
    const usageMap: Record<string, { dl: number; ul: number }> = {};
    const topupsMap: Record<string, Array<{ id: number; sizeGb: string; consumedBytes: string; appliedAt: Date; expiresAt: Date | null; packageName?: string }>> = {};
    const onlineSet = new Set<string>();
    if (usernames.length) {
      // "Online" = any session row that hasn't been stopped — matches the
      // single-user detail page exactly so the list pill and the in-detail
      // pill never disagree. Stuck sessions (NAS died without sending Stop)
      // would show as online here; the operator clears them from the
      // Accounting page's "تنظيف الجلسات المعلّقة" button.
      // Scope online detection to the tenant so a colliding username on another
      // tenant doesn't mark this tenant's subscriber as online. NULL = owner
      // cross-tenant view, where we don't filter (each row already maps to its
      // own tenant via the join).
      const liveRows = tenantId
        ? await this.dataSource.query(
            `SELECT DISTINCT username FROM radacct
             WHERE username = ANY($1::text[])
               AND acctstoptime IS NULL
               AND tenant_id = $2`,
            [usernames, tenantId],
          )
        : await this.dataSource.query(
            `SELECT DISTINCT username FROM radacct
             WHERE username = ANY($1::text[])
               AND acctstoptime IS NULL`,
            [usernames],
          );
      for (const r of liveRows) onlineSet.add(r.username);
    }
    if (usernames.length) {
      const rows = await this.dataSource.query(
        `SELECT username,
                total_upload_bytes   AS ul,
                total_download_bytes AS dl
         FROM user_data_usage
         WHERE username = ANY($1::text[])
           AND COALESCE(tenant_id,-1) = COALESCE($2,-1)`,
        [usernames, tenantId],
      );
      for (const r of rows) usageMap[r.username] = { dl: Number(r.dl), ul: Number(r.ul) };

      // Fetch all non-expired topups per user (oldest first for FIFO consumption)
      const topupRows = await this.dataSource.query(
        `SELECT ut.id, ut.username, ut.size_gb AS "sizeGb", ut.consumed_bytes AS "consumedBytes",
                ut.applied_at AS "appliedAt", ut.expires_at AS "expiresAt", tp.name AS "packageName"
         FROM user_topups ut
         LEFT JOIN topup_packages tp ON tp.id = ut.package_id
         WHERE ut.username = ANY($1::text[])
           AND COALESCE(ut.tenant_id,-1) = COALESCE($2,-1)
           AND (ut.expires_at IS NULL OR ut.expires_at > NOW())
         ORDER BY ut.applied_at ASC`,
        [usernames, tenantId],
      );
      for (const r of topupRows) {
        if (!topupsMap[r.username]) topupsMap[r.username] = [];
        topupsMap[r.username].push({ id: r.id, sizeGb: r.sizeGb, consumedBytes: r.consumedBytes, appliedAt: r.appliedAt, expiresAt: r.expiresAt, packageName: r.packageName });
      }
    }

    const months: Record<string,number> = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

    // 'online' status keeps only profiles with an open radacct session.
    const visibleProfiles = status === 'online'
      ? profiles.filter(p => onlineSet.has(p.username))
      : profiles;

    return visibleProfiles.map((p) => {
      const expiresAt = this.expirationDate(p.startDate, p.durationDays);
      const parts = expiresAt.split(' ');
      const expiryDate = new Date(Number(parts[2]), months[parts[0]], Number(parts[1]));
      const remainingDays = Math.ceil((expiryDate.getTime() - Date.now()) / 86400000);
      const usage = usageMap[p.username] ?? { dl: 0, ul: 0 };
      const plan = p.plan;
      const planTotalGb = plan?.totalLimitGb ? Number(plan.totalLimitGb) : 0;
      const planDlGb    = plan?.downloadLimitGb ? Number(plan.downloadLimitGb) : 0;
      const isTotalQuota = planTotalGb > 0;
      const usedBytes = isTotalQuota ? (usage.dl + usage.ul) : usage.dl;
      const limitBytes = isTotalQuota
        ? Math.floor(planTotalGb * 1024**3)
        : planDlGb > 0
          ? Math.floor(planDlGb * 1024**3)
          : null;
      // Per-topup tracking: each topup has stored consumed_bytes (persists across
      // plan renewals). On top of that, the current cycle's overage is
      // distributed FIFO into remaining capacity for live display.
      const planLimitForBonus = limitBytes ?? 0;
      const overage = Math.max(0, usedBytes - planLimitForBonus);
      const userTopups = topupsMap[p.username] ?? [];
      let remOverage = overage;
      const topupsDetail = userTopups.map(t => {
        const originalBytes = Math.floor(Number(t.sizeGb) * 1024 ** 3);
        const storedConsumed = Number(t.consumedBytes ?? '0');
        const capacity = Math.max(0, originalBytes - storedConsumed);
        const cycleShare = Math.min(remOverage, capacity);
        remOverage -= cycleShare;
        const totalConsumed = storedConsumed + cycleShare;
        return {
          id: t.id,
          packageName: t.packageName ?? null,
          appliedAt: t.appliedAt,
          expiresAt: t.expiresAt,
          totalBytes: originalBytes,
          usedBytes: totalConsumed,
          remainingBytes: Math.max(0, originalBytes - totalConsumed),
        };
      });
      const bonusTotal = topupsDetail.reduce((s, t) => s + t.totalBytes, 0);
      const bonusUsed  = topupsDetail.reduce((s, t) => s + t.usedBytes, 0);
      const bonusRemaining = topupsDetail.reduce((s, t) => s + t.remainingBytes, 0);
      return {
        username: p.username,
        firstName: p.firstName,
        mobile: p.mobile,
        address: p.address,
        notes: p.notes,
        groupName: (p as any).groupName ?? null,
        startDate: p.startDate,
        durationDays: p.durationDays,
        planId: p.planId,
        plan: p.plan ? { id: p.plan.id, name: p.plan.name, price: p.plan.price } : null,
        tenantId: p.tenantId,
        tenantName: (p as any).tenant?.name ?? null,
        connectionType: (p as any).connectionType ?? 'hotspot',
        expiresAt,
        remainingDays,
        isOnline:    onlineSet.has(p.username),
        isSuspended: p.isSuspended,
        isArchived:  p.isArchived,
        remainingDownloadBytes: limitBytes !== null ? Math.max(0, limitBytes - usedBytes) : null,
        downloadLimitBytes: limitBytes,
        totalDownloadBytes: usedBytes,
        bonusTotalBytes:     bonusTotal,
        bonusUsedBytes:      bonusUsed,
        bonusRemainingBytes: bonusRemaining,
        topups: topupsDetail,
      };
    });
  }

  async findOne(username: string, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const profile = await this.profileRepo.findOne({
      where: this.w<UserProfile>(tenantId, { username } as any),
      relations: ['plan'],
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);
    const checks  = await this.radCheckRepo.find({ where: this.w(tenantId, { username }) });
    const replies = await this.radReplyRepo.find({ where: this.w(tenantId, { username }) });
    const groups  = await this.radUserGroupRepo.find({ where: this.w(tenantId, { username }) });
    return {
      username: profile.username,
      firstName: profile.firstName,
      mobile: profile.mobile,
      address: profile.address,
      notes: profile.notes,
      groupName: profile.groupName ?? null,
      startDate: profile.startDate,
      durationDays: profile.durationDays,
      planId: profile.planId,
      plan: profile.plan ? { id: profile.plan.id, name: profile.plan.name } : null,
      expiresAt: this.expirationDate(profile.startDate, profile.durationDays),
      groups: groups.map(g => g.groupName),
      checks: checks.map(c => ({ attribute: c.attribute, op: c.op, value: c.value })),
      replies: replies.map(r => ({ attribute: r.attribute, op: r.op, value: r.value })),
    };
  }

  async create(dto: CreateRadiusUserDto, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) {
      throw new BadRequestException('يجب تحديد العميل (tenantId) قبل إنشاء مشترك جديد');
    }

    // Mobile is mandatory and project-wide unique (DB has a partial index too;
    // we pre-check here for a clean error message).
    const mobile = dto.mobile?.trim();
    if (!mobile) throw new BadRequestException('رقم الموبايل مطلوب');
    const mobileTaken = await this.profileRepo.findOne({ where: { mobile } });
    if (mobileTaken) {
      throw new ConflictException(`رقم الموبايل ${mobile} مسجّل بالفعل لمشترك آخر`);
    }

    const exists = await this.profileRepo.findOne({
      where: { username: dto.username, tenantId: tenantId ?? undefined },
    });
    // If the subscriber exists but is archived, treat create as restore+update
    // instead of rejecting — allows re-adding the same MAC under a new plan.
    if (exists && !exists.isArchived) {
      throw new ConflictException(`المستخدم '${dto.username}' موجود مسبقاً في هذا الحساب`);
    }
    if (exists?.isArchived) {
      // Delegate to the update path with renewal dates to unarchive the subscriber
      const updateDto: UpdateRadiusUserDto = {
        planId:       dto.planId,
        startDate:    dto.startDate,
        durationDays: dto.durationDays,
        firstName:    dto.firstName,
        address:      dto.address,
        mobile:       dto.mobile,
        notes:        dto.notes,
        ...(dto.password !== undefined ? { password: dto.password } : {}),
      };
      // Unarchive first so update() doesn't hit a tenant conflict
      await this.dataSource.transaction(async (mgr) => {
        await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username: dto.username, attribute: 'Auth-Type' }));
        exists.isArchived = false;
        await mgr.save(UserProfile, exists);
      });
      return this.update(dto.username, updateDto, user, tenantId ?? undefined);
    }

    const plan = await this.planRepo.findOne({
      where: this.w<Plan>(tenantId, { id: dto.planId } as any),
    });
    if (!plan) throw new BadRequestException(`الخطة غير موجودة`);

    const password = dto.password?.trim() ?? '';
    const expiryTime = await this.getTenantExpiryTime(tenantId);
    const expiration = this.expirationDate(dto.startDate, dto.durationDays, expiryTime);
    const replyAttrs = this.buildReplyAttrs(plan);

    await this.dataSource.transaction(async (mgr) => {
      // password supplied → Cleartext-Password (works with PAP/CHAP/MS-CHAP).
      // password blank    → Auth-Type=Accept   (passwordless — needs the
      //                      "Auth-Type Accept { ok }" handler in sites-enabled/default
      //                      AND http-pap on the MikroTik hotspot profile).
      if (password) {
        await mgr.save(RadCheck, {
          username: dto.username, attribute: 'Cleartext-Password', op: ':=', value: password, tenantId,
        });
      } else {
        await mgr.save(RadCheck, {
          username: dto.username, attribute: 'Auth-Type', op: ':=', value: 'Accept', tenantId,
        });
      }
      await mgr.save(RadCheck, {
        username: dto.username, attribute: 'Expiration', op: ':=', value: expiration, tenantId,
      });

      // Connection-type enforcement: stored as a control scratch attribute so
      // the authorize policy in sites-enabled/default can reject a hotspot user
      // who connects via PPPoE (and vice versa).
      await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username: dto.username, attribute: 'Tmp-String-9' }));
      await mgr.save(RadCheck, {
        username: dto.username, attribute: 'Tmp-String-9', op: ':=', value: dto.connectionType ?? 'hotspot', tenantId,
      });

      for (const attr of replyAttrs) {
        await mgr.save(RadReply, { username: dto.username, ...attr, tenantId });
      }

      // Write quota limits to radcheck so FreeRADIUS sqlcounter can block reconnection
      for (const a of this.QUOTA_CHECK_ATTRIBUTES) {
        await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username: dto.username, attribute: a }));
      }
      for (const attr of this.buildQuotaCheckAttrs(plan)) {
        await mgr.save(RadCheck, { username: dto.username, ...attr, tenantId });
      }

      // New user: snapshot current cumulative bytes for this username as the
      // baseline. Filter by tenant_id so each tenant gets its own baseline.
      await mgr.query(
        `UPDATE user_data_usage
           SET total_download_bytes      = 0,
               total_upload_bytes        = 0,
               updated_at                = NOW(),
               quota_reset_at            = NOW(),
               quota_baseline_out_bytes  = COALESCE((SELECT SUM(acctoutputoctets) FROM radacct WHERE username=$1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)), 0),
               quota_baseline_in_bytes   = COALESCE((SELECT SUM(acctinputoctets)  FROM radacct WHERE username=$1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)), 0)
         WHERE username = $1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)`,
        [dto.username, tenantId],
      );
      await mgr.query(
        `INSERT INTO user_data_usage (username, tenant_id, total_download_bytes, total_upload_bytes, updated_at, quota_reset_at, quota_baseline_out_bytes, quota_baseline_in_bytes)
         VALUES ($1::text, $2, 0, 0, NOW(), NOW(),
           COALESCE((SELECT SUM(acctoutputoctets) FROM radacct WHERE username=$1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)), 0),
           COALESCE((SELECT SUM(acctinputoctets)  FROM radacct WHERE username=$1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)), 0))
         ON CONFLICT (username, COALESCE(tenant_id, -1)) DO NOTHING`,
        [dto.username, tenantId],
      );

      await mgr.save(UserProfile, {
        username: dto.username,
        tenantId,
        planId: dto.planId,
        firstName: dto.firstName,
        address: dto.address ?? null,
        mobile: dto.mobile ?? null,
        notes: dto.notes ?? null,
        groupName: dto.groupName?.trim() || null,
        startDate: dto.startDate,
        durationDays: dto.durationDays,
        connectionType: dto.connectionType ?? 'hotspot',
        portalPasswordHash: dto.portalPassword?.trim()
          ? await bcrypt.hash(dto.portalPassword.trim(), 10)
          : null,
      });
    });

    // If the admin entered an initial usage carried over from another system,
    // apply it the same way as the manual adjust button on the detail page.
    if (dto.initialUsageGb && Number.isFinite(dto.initialUsageGb) && dto.initialUsageGb > 0) {
      await this.adjustUsage(dto.username, dto.initialUsageGb, user, tenantId ?? undefined)
        .catch(e => this.logger.warn(`initial usage adjust failed for ${dto.username}: ${e?.message ?? e}`));
    }

    return this.findOne(dto.username, user, tenantId ?? undefined);
  }

  async update(username: string, dto: UpdateRadiusUserDto, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('يجب تحديد العميل');
    const profile = await this.profileRepo.findOne({
      where: this.w<UserProfile>(tenantId, { username } as any),
      relations: ['plan'],
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);

    // Project-wide mobile uniqueness — only check when mobile actually changes.
    if (dto.mobile !== undefined) {
      const newMobile = (dto.mobile ?? '').trim();
      if (newMobile && newMobile !== (profile.mobile ?? '')) {
        const taken = await this.profileRepo
          .createQueryBuilder('p')
          .where('p.mobile = :m', { m: newMobile })
          .andWhere('p.username <> :u', { u: username })
          .getOne();
        if (taken) {
          throw new ConflictException(`رقم الموبايل ${newMobile} مسجّل بالفعل لمشترك آخر`);
        }
      }
    }

    // ── Rename cascade ────────────────────────────────────────────────────
    // If the admin supplied a new username and it differs, atomically rename
    // across every table that key-references it. We do this BEFORE the rest
    // of the update so subsequent queries use the new key.
    if (dto.newUsername && dto.newUsername.trim() && dto.newUsername.trim() !== username) {
      const newUsername = dto.newUsername.trim();
      const taken = await this.profileRepo.findOne({
        where: this.w<UserProfile>(tenantId, { username: newUsername } as any),
      });
      if (taken) throw new ConflictException(`اسم المستخدم "${newUsername}" مستخدم بالفعل`);

      await this.dataSource.transaction(async (mgr) => {
        const args = [newUsername, username, tenantId];
        const where = `username = $2 AND COALESCE(tenant_id, -1) = COALESCE($3, -1)`;
        await mgr.query(`UPDATE user_profiles    SET username = $1 WHERE ${where}`, args);
        await mgr.query(`UPDATE radcheck         SET username = $1 WHERE ${where}`, args);
        await mgr.query(`UPDATE radreply         SET username = $1 WHERE ${where}`, args);
        await mgr.query(`UPDATE radusergroup     SET username = $1 WHERE ${where}`, args);
        await mgr.query(`UPDATE radacct          SET username = $1 WHERE ${where}`, args);
        await mgr.query(`UPDATE radpostauth      SET username = $1 WHERE ${where}`, args);
        await mgr.query(`UPDATE user_data_usage  SET username = $1 WHERE ${where}`, args);
        await mgr.query(`UPDATE user_topups      SET username = $1 WHERE ${where}`, args);
        await mgr.query(`UPDATE polled_usage     SET username = $1 WHERE ${where}`, args);
      });

      // Kick any active session so the next reconnect uses the new credential.
      this.kickUser(newUsername, tenantId).catch(() => {});

      // The rest of update() expects `username` to match the current row —
      // swap to the new one so subsequent updates target the renamed record.
      username = newUsername;
      profile.username = newUsername;
    }

    const newStartDate    = dto.startDate    ?? profile.startDate;
    const newDurationDays = dto.durationDays ?? profile.durationDays;

    // Renewal restoration: only treat as renewal if dates ACTUALLY changed
    // (frontends often pre-fill these fields, so we compare against the
    // stored values instead of just checking if the keys were sent).
    const startChanged    = !!dto.startDate    && String(dto.startDate)    !== String(profile.startDate);
    const durationChanged = !!dto.durationDays && Number(dto.durationDays) !== Number(profile.durationDays);
    const isRenewal       = startChanged || durationChanged;
    let effectivePlanId = dto.planId ?? profile.planId;
    if (isRenewal && dto.planId === undefined && profile.originalPlanId != null) {
      effectivePlanId = profile.originalPlanId;
    }
    const newPlanId = effectivePlanId;

    // Decide whether to reload the plan + rewrite radreply/quota check attrs.
    // We always reload on renewal so radreply is guaranteed to reflect the
    // current plan — even if planId hasn't changed (radreply may have stale
    // attributes from a prior fallback switch).
    const restoringFromFallback = isRenewal && profile.originalPlanId != null && dto.planId === undefined;
    const shouldReloadPlan =
      !!dto.planId ||
      restoringFromFallback ||
      (isRenewal && effectivePlanId != null);

    let plan: Plan | null = null;
    if (shouldReloadPlan && effectivePlanId) {
      plan = await this.planRepo.findOne({
        where: this.w<Plan>(tenantId, { id: effectivePlanId } as any),
      });
      if (!plan) throw new BadRequestException(`الخطة غير موجودة`);
    }

    await this.dataSource.transaction(async (mgr) => {
      if (dto.password !== undefined) {
        const newPass = dto.password?.trim() ?? '';
        // Swap between Cleartext-Password (with password) and Auth-Type=Accept (passwordless).
        await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Cleartext-Password' }));
        await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Auth-Type' }));
        if (newPass) {
          await mgr.save(RadCheck, {
            username, attribute: 'Cleartext-Password', op: ':=', value: newPass, tenantId,
          });
        } else {
          await mgr.save(RadCheck, {
            username, attribute: 'Auth-Type', op: ':=', value: 'Accept', tenantId,
          });
        }
      }

      // Only run the renewal pipeline when the dates ACTUALLY changed.
      // A plan-only change (same start_date + duration_days) must NOT reset
      // the byte counters — the subscriber keeps their accumulated usage.
      if (isRenewal) {
        const expiryTime = await this.getTenantExpiryTime(tenantId);
        const expiration = this.expirationDate(newStartDate, newDurationDays, expiryTime);
        await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Expiration' }));
        await mgr.save(RadCheck, {
          username, attribute: 'Expiration', op: ':=', value: expiration, tenantId,
        });

        // Topups are independent of plan renewal — bonus is NEVER renewed.
        // BEFORE resetting usage: snapshot the current overage and bake it into
        // per-topup consumed_bytes (FIFO, oldest first). This preserves
        // consumption history so the bonus remains "spent" across renewals.
        const usageRows = await mgr.query(
          `SELECT COALESCE(total_download_bytes,0)::bigint AS dl, COALESCE(total_upload_bytes,0)::bigint AS ul
             FROM user_data_usage WHERE username=$1 AND COALESCE(tenant_id,-1)=COALESCE($2,-1)`,
          [username, tenantId],
        );
        const consumedDl = BigInt(usageRows[0]?.dl ?? 0);
        const consumedUl = BigInt(usageRows[0]?.ul ?? 0);

        const effectivePlan = plan ?? profile.plan;
        let planLimitBytes = 0n;
        if (effectivePlan) {
          if (effectivePlan.totalLimitGb && Number(effectivePlan.totalLimitGb) > 0) {
            planLimitBytes = BigInt(Math.floor(Number(effectivePlan.totalLimitGb) * 1024 ** 3));
          } else if (effectivePlan.downloadLimitGb && Number(effectivePlan.downloadLimitGb) > 0) {
            planLimitBytes = BigInt(Math.floor(Number(effectivePlan.downloadLimitGb) * 1024 ** 3));
          }
        }
        const consumed = (effectivePlan?.totalLimitGb && Number(effectivePlan.totalLimitGb) > 0)
          ? (consumedDl + consumedUl)
          : consumedDl;
        const overage = consumed > planLimitBytes ? consumed - planLimitBytes : 0n;

        // Distribute overage across non-expired topups (FIFO oldest first)
        if (overage > 0n) {
          const topups = await mgr.query(
            `SELECT id, size_gb::numeric AS size_gb, consumed_bytes::bigint AS consumed_bytes
             FROM user_topups
             WHERE username=$1 AND COALESCE(tenant_id,-1)=COALESCE($2,-1)
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY applied_at ASC`,
            [username, tenantId],
          );
          let remOverage = overage;
          for (const t of topups) {
            if (remOverage <= 0n) break;
            const original = BigInt(Math.floor(Number(t.size_gb) * 1024 ** 3));
            const alreadyConsumed = BigInt(t.consumed_bytes ?? 0);
            const capacity = original > alreadyConsumed ? original - alreadyConsumed : 0n;
            if (capacity === 0n) continue;
            const take = remOverage > capacity ? capacity : remOverage;
            await mgr.query(
              `UPDATE user_topups SET consumed_bytes = consumed_bytes + $1::bigint WHERE id = $2`,
              [String(take), t.id],
            );
            remOverage -= take;
          }
        }

        // Recompute profile.bonusRemainingBytes from topups (= remaining pool)
        const rem = await mgr.query(
          `SELECT COALESCE(SUM(GREATEST(0, (size_gb * (1024*1024*1024))::bigint - consumed_bytes)), 0)::bigint AS rem
           FROM user_topups
           WHERE username=$1 AND COALESCE(tenant_id,-1)=COALESCE($2,-1)
             AND (expires_at IS NULL OR expires_at > NOW())`,
          [username, tenantId],
        );
        profile.bonusRemainingBytes = String(rem[0]?.rem ?? '0');

        // Reset usage counters: snapshot current cumulative bytes as baseline (per-tenant)
        await mgr.query(
          `UPDATE user_data_usage
             SET total_download_bytes      = 0,
                 total_upload_bytes        = 0,
                 updated_at                = NOW(),
                 quota_reset_at            = NOW(),
                 quota_baseline_out_bytes  = COALESCE((SELECT SUM(acctoutputoctets) FROM radacct WHERE username=$1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)), 0),
                 quota_baseline_in_bytes   = COALESCE((SELECT SUM(acctinputoctets)  FROM radacct WHERE username=$1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)), 0)
           WHERE username = $1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)`,
          [username, tenantId],
        );
        await mgr.query(
          `INSERT INTO user_data_usage (username, tenant_id, total_download_bytes, total_upload_bytes, updated_at, quota_reset_at, quota_baseline_out_bytes, quota_baseline_in_bytes)
           VALUES ($1::text, $2, 0, 0, NOW(), NOW(),
             COALESCE((SELECT SUM(acctoutputoctets) FROM radacct WHERE username=$1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)), 0),
             COALESCE((SELECT SUM(acctinputoctets)  FROM radacct WHERE username=$1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)), 0))
           ON CONFLICT (username, COALESCE(tenant_id, -1)) DO NOTHING`,
          [username, tenantId],
        );

        // Renewal clears the auth block from quota exhaustion (scoped to this tenant)
        await mgr.query(
          `DELETE FROM radcheck WHERE username = $1 AND COALESCE(tenant_id,-1) = COALESCE($2,-1) AND attribute = 'Calling-Station-Id' AND value = '__QUOTA_EXHAUSTED__'`,
          [username, tenantId],
        );
        await mgr.query(
          `DELETE FROM radreply WHERE username = $1 AND COALESCE(tenant_id,-1) = COALESCE($2,-1) AND attribute = 'Reply-Message' AND value LIKE '%الكوتا%'`,
          [username, tenantId],
        );
      }

      // Plan-only change (no renewal): the byte counters carry over UNTOUCHED.
      // remaining_on_new_plan = new_plan_limit - existing_used_bytes.
      // No reset, no subtraction — just swap the plan and the radreply/radcheck
      // attrs below pick up the new limits.

      if (plan) {
        await mgr.delete(RadReply, this.w<RadReply>(tenantId, { username }));
        for (const attr of this.buildReplyAttrs(plan)) {
          await mgr.save(RadReply, { username, ...attr, tenantId });
        }

        // Keep quota check attrs in sync with the new plan + bonus pool
        for (const a of this.QUOTA_CHECK_ATTRIBUTES) {
          await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: a }));
        }
        const bonusBytes = BigInt(profile.bonusRemainingBytes || '0');
        for (const attr of this.buildQuotaCheckAttrsWithBonus(plan, bonusBytes)) {
          await mgr.save(RadCheck, { username, ...attr, tenantId });
        }
      }

      // Clear originalPlanId if we're either:
      //  - restoring the original plan via renewal
      //  - admin explicitly picked a plan (resets the fallback memory)
      const clearOriginal =
        (isRenewal && profile.originalPlanId != null && newPlanId === profile.originalPlanId) ||
        dto.planId !== undefined;

      Object.assign(profile, {
        planId:         newPlanId,
        plan:           plan ?? profile.plan,
        originalPlanId: clearOriginal ? null : profile.originalPlanId,
        startDate:      newStartDate,
        durationDays:   newDurationDays,
        firstName:      dto.firstName    ?? profile.firstName,
        address:        dto.address      ?? profile.address,
        mobile:         dto.mobile       ?? profile.mobile,
        notes:          dto.notes        ?? profile.notes,
        groupName:      dto.groupName !== undefined ? (dto.groupName.trim() || null) : profile.groupName,
        connectionType: dto.connectionType ?? profile.connectionType,
      });
      // Reset portal password only when a non-empty value is supplied.
      if (dto.portalPassword !== undefined && dto.portalPassword.trim()) {
        profile.portalPasswordHash = await bcrypt.hash(dto.portalPassword.trim(), 10);
      }

      // Keep the connection-type enforcement scratch attribute in sync so the
      // authorize policy rejects a hotspot/PPPoE mismatch after any edit.
      await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Tmp-String-9' }));
      await mgr.save(RadCheck, {
        username, attribute: 'Tmp-String-9', op: ':=', value: profile.connectionType ?? 'hotspot', tenantId,
      });

      await mgr.save(UserProfile, profile);
    });

    // On renewal: kick the active session so a fresh session starts post-renewal.
    // Any bytes from the previous session belong to the old quota cycle (excluded
    // by quota_reset_at). The new session will be counted from zero.
    // Without this kick, an already-active session would keep accumulating bytes
    // that wouldn't count (since acctstarttime < quota_reset_at) and the user
    // could effectively use unlimited data on the open session.
    if (isRenewal) {
      this.kickUser(username, tenantId).catch(() => {});
      // Log a sales receipt — survives plan renames & assistant deletions by
      // snapshotting human-readable names. Fire-and-forget; receipt failure
      // must not break the renewal itself.
      this.dataSource.query(
        `INSERT INTO sales_receipts
          (tenant_id, admin_id, admin_email, admin_name, username, subscriber_name, plan_id, plan_name, price, days_renewed, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          tenantId,
          user.id,
          user.email,
          user.fullName,
          username,
          profile.firstName,
          (plan ?? profile.plan)?.id ?? null,
          (plan ?? profile.plan)?.name ?? null,
          (plan ?? profile.plan)?.price ?? null,
          newDurationDays,
        ],
      ).catch(e => this.logger.error(`Failed to log sales receipt for ${username}: ${e?.message ?? e}`));
    } else if (plan) {
      // Plan-only change: CoA updates the active session without disconnecting
      this.sendCoA(username, plan, newStartDate, newDurationDays, tenantId).catch(() => {});
    }

    return this.findOne(username, user, tenantId ?? undefined);
  }

  private async sendCoASessionTimeout(
    username: string,
    startDate: string,
    durationDays: number,
    tenantId: number | null,
  ): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT nasipaddress, framedipaddress, acctsessionid FROM radacct
       WHERE username = $1 AND acctstoptime IS NULL
         AND COALESCE(tenant_id,-1) = COALESCE($2,-1)
       ORDER BY acctstarttime DESC LIMIT 1`,
      [username, tenantId],
    );
    if (!rows.length) return;

    // Compute remaining seconds until subscription expiry
    const expiry = new Date(startDate);
    expiry.setDate(expiry.getDate() + durationDays);
    const remainingSecs = Math.max(0, Math.floor((expiry.getTime() - Date.now()) / 1000));
    if (remainingSecs === 0) return;

    const sessionNasIp: string = (rows[0].nasipaddress as string).split('/')[0];
    const framedIp: string     = (rows[0].framedipaddress as string).split('/')[0];
    const sessionId: string    = rows[0].acctsessionid;

    const attrLines = `Session-Timeout = "${remainingSecs}"`;
    const pkt = `User-Name = "${username}"\nAcct-Session-Id = "${sessionId}"\nFramed-IP-Address = ${framedIp}\n${attrLines}`;

    const allNas = await this.nasRepo.find(tenantId ? { where: { tenantId } } : undefined);
    const seen = new Set<string>();
    const candidates: { ip: string; secret: string }[] = [];
    const add = (ip: string, secret: string) => {
      const clean = ip.split('/')[0];
      if (!seen.has(clean)) { seen.add(clean); candidates.push({ ip: clean, secret }); }
    };
    const exact = allNas.find(n => n.nasname.split('/')[0] === sessionNasIp);
    if (exact) add(exact.nasname, exact.secret);
    add(sessionNasIp, allNas[0]?.secret ?? 'testing123');
    for (const n of allNas) add(n.nasname, n.secret);

    for (const { ip, secret } of candidates) {
      const result = await this.sendRadiusPacket('coa', ip, secret, pkt);
      if (result === 'ack') return;
      if (result === 'nak-notfound') break;
    }
  }

  async getStats(username: string, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const profile = await this.profileRepo.findOne({
      where: this.w<UserProfile>(tenantId, { username } as any),
      relations: ['plan'],
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);

    // Live-sync usage so the stats reflect the latest accounting packets
    await this.quotaEnforcer.syncUsage(username, tenantId).catch(() => {});

    // Remaining days
    const expiryStr = this.expirationDate(profile.startDate, profile.durationDays);
    const months: Record<string,number> = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const parts = expiryStr.split(' ');
    const expiryDate = new Date(Number(parts[2]), months[parts[0]], Number(parts[1]));
    const remainingDays = Math.ceil((expiryDate.getTime() - Date.now()) / 86400000);

    // Usage totals from user_data_usage (persistent, reset-aware) — scoped per tenant
    const usageRows = await this.dataSource.query(
      `SELECT
         COALESCE(total_upload_bytes, 0)::bigint   AS total_upload,
         COALESCE(total_download_bytes, 0)::bigint AS total_download
       FROM user_data_usage
       WHERE username = $1::text
         AND COALESCE(tenant_id,-1) = COALESCE($2,-1)
       ORDER BY quota_reset_at DESC LIMIT 1`,
      [username, tenantId],
    );
    const totalUploadBytes   = Number(usageRows[0]?.total_upload   ?? 0);
    const totalDownloadBytes = Number(usageRows[0]?.total_download ?? 0);

    // Active session — scoped per tenant
    const activeRows = await this.dataSource.query(
      `SELECT framedipaddress, nasipaddress, acctstarttime,
              acctinputoctets, acctoutputoctets, acctsessiontime
       FROM radacct
       WHERE username = $1::text AND acctstoptime IS NULL
         AND COALESCE(tenant_id,-1) = COALESCE($2,-1)
       ORDER BY acctstarttime DESC LIMIT 1`,
      [username, tenantId],
    );
    const active = activeRows[0] ?? null;

    // Recent sessions (up to 500) — scoped per tenant. We'll bucket them
    // client-side into renewal cycles below.
    const sessions = await this.dataSource.query(
      `SELECT acctstarttime, acctstoptime, framedipaddress, nasipaddress,
              acctinputoctets, acctoutputoctets, acctsessiontime, acctterminatecause
       FROM radacct
       WHERE username = $1::text
         AND COALESCE(tenant_id,-1) = COALESCE($2,-1)
       ORDER BY acctstarttime DESC LIMIT 500`,
      [username, tenantId],
    );

    // Renewal cycles: each sales_receipt.paid_at marks the START of a new
    // billing cycle. Sessions are bucketed by their start time against these
    // boundaries so each cycle gets its own subtotal.
    const receipts: { paid_at: Date; plan_name: string | null; days_renewed: number }[] =
      await this.dataSource.query(
        `SELECT paid_at, plan_name, days_renewed FROM sales_receipts
         WHERE username = $1 AND COALESCE(tenant_id,-1) = COALESCE($2,-1)
         ORDER BY paid_at ASC`,
        [username, tenantId],
      );

    const plan = profile.plan;
    const isTotalQuota = !!(plan?.totalLimitGb && Number(plan.totalLimitGb) > 0);
    const totalLimitBytes    = isTotalQuota ? Math.floor(Number(plan!.totalLimitGb) * 1024**3) : null;
    const downloadLimitBytes = !isTotalQuota && plan?.downloadLimitGb ? Math.floor(Number(plan.downloadLimitGb) * 1024**3) : null;
    const uploadLimitBytes   = !isTotalQuota && plan?.uploadLimitGb   ? Math.floor(Number(plan.uploadLimitGb)   * 1024**3) : null;

    const usedForLimit = isTotalQuota ? (totalDownloadBytes + totalUploadBytes) : totalDownloadBytes;
    const limitForCalc = isTotalQuota ? totalLimitBytes : downloadLimitBytes;

    // Bonus = stored per-topup consumed_bytes + current cycle overage share (FIFO).
    // Fetch active topups and compute remaining per topup.
    const topupRowsStats: { id: string; sizeGb: string; consumedBytes: string; expiresAt: Date | null }[] =
      await this.dataSource.query(
        `SELECT id, size_gb AS "sizeGb", consumed_bytes AS "consumedBytes", expires_at AS "expiresAt"
         FROM user_topups
         WHERE username = $1::text
           AND COALESCE(tenant_id,-1) = COALESCE($2,-1)
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY applied_at ASC`,
        [username, tenantId],
      );
    const planLimitForBonus = limitForCalc ?? 0;
    const overage = Math.max(0, usedForLimit - planLimitForBonus);
    let remOverageStats = overage;
    let bonusTotalBytes = 0;
    let bonusUsedBytes = 0;
    let bonusNearestExpiry: Date | null = null;
    for (const t of topupRowsStats) {
      const original = Math.floor(Number(t.sizeGb) * 1024 ** 3);
      const storedConsumed = Number(t.consumedBytes ?? '0');
      const capacity = Math.max(0, original - storedConsumed);
      const cycleShare = Math.min(remOverageStats, capacity);
      remOverageStats -= cycleShare;
      bonusTotalBytes += original;
      bonusUsedBytes  += storedConsumed + cycleShare;
      // Track the soonest expiry among topups that still have remaining bytes.
      if (capacity > 0 && t.expiresAt) {
        if (!bonusNearestExpiry || new Date(t.expiresAt) < bonusNearestExpiry) {
          bonusNearestExpiry = new Date(t.expiresAt);
        }
      }
    }
    const bonusRemainingBytes = Math.max(0, bonusTotalBytes - bonusUsedBytes);

    return {
      username,
      firstName:    profile.firstName,
      mobile:       profile.mobile,
      address:      profile.address,
      notes:        profile.notes,
      startDate:    profile.startDate,
      durationDays: profile.durationDays,
      expiresAt:    expiryStr,
      remainingDays,
      plan: plan ? { id: plan.id, name: plan.name, downloadMbps: plan.downloadMbps, uploadMbps: plan.uploadMbps } : null,
      usage: {
        totalDownloadBytes,
        totalUploadBytes,
        totalLimitBytes,
        downloadLimitBytes,
        uploadLimitBytes,
        isTotalQuota,
        remainingBytes:        limitForCalc !== null ? Math.max(0, limitForCalc - usedForLimit) : null,
        remainingDownloadBytes: downloadLimitBytes !== null ? Math.max(0, downloadLimitBytes - totalDownloadBytes) : null,
        remainingUploadBytes:   uploadLimitBytes   !== null ? Math.max(0, uploadLimitBytes   - totalUploadBytes)   : null,
      },
      bonus: {
        totalBytes:     bonusTotalBytes,
        usedBytes:      bonusUsedBytes,
        remainingBytes: bonusRemainingBytes,
        nearestExpiry:  bonusNearestExpiry,
      },
      activeSession: active ? {
        ip:            active.framedipaddress,
        nasIp:         active.nasipaddress,
        startTime:     active.acctstarttime,
        sessionTime:   Number(active.acctsessiontime ?? 0),
        uploadBytes:   Number(active.acctinputoctets  ?? 0),
        downloadBytes: Number(active.acctoutputoctets ?? 0),
      } : null,
      sessions: sessions.map((s: any) => ({
        startTime:     s.acctstarttime,
        stopTime:      s.acctstoptime,
        ip:            s.framedipaddress,
        nasIp:         s.nasipaddress,
        uploadBytes:   Number(s.acctinputoctets  ?? 0),
        downloadBytes: Number(s.acctoutputoctets ?? 0),
        durationSec:   Number(s.acctsessiontime  ?? 0),
        terminateCause: s.acctterminatecause,
      })),
      cycles: this.bucketSessionsByCycle(sessions, receipts),
    };
  }

  /** Bucket sessions into renewal cycles. Each cycle ranges from one receipt's
   *  paid_at (exclusive) to the next (or NOW for the current cycle). Sessions
   *  that started before the first receipt go into an initial "before first
   *  renewal" cycle. Cycles are returned newest-first. */
  private bucketSessionsByCycle(
    sessions: any[],
    receipts: { paid_at: Date; plan_name: string | null; days_renewed: number }[],
  ) {
    // Build cycle boundaries (newest first)
    type Cycle = {
      label: string;
      startsAt: string | null;
      endsAt:   string | null;
      planName: string | null;
      daysRenewed: number | null;
      sessions: any[];
      totalDownloadBytes: number;
      totalUploadBytes: number;
    };
    const cycles: Cycle[] = [];
    // Current cycle: from last receipt's paid_at to now (or all-time if none)
    const lastReceiptAt = receipts.length ? receipts[receipts.length - 1].paid_at : null;
    cycles.push({
      label: 'الفترة الحالية',
      startsAt: lastReceiptAt ? new Date(lastReceiptAt).toISOString() : null,
      endsAt: null,
      planName: receipts.length ? receipts[receipts.length - 1].plan_name : null,
      daysRenewed: receipts.length ? receipts[receipts.length - 1].days_renewed : null,
      sessions: [],
      totalDownloadBytes: 0,
      totalUploadBytes: 0,
    });
    // Previous cycles: walk backwards through receipts
    for (let i = receipts.length - 1; i >= 1; i--) {
      cycles.push({
        label: `تجديد ${new Date(receipts[i - 1].paid_at).toLocaleDateString('ar-EG')}`,
        startsAt: new Date(receipts[i - 1].paid_at).toISOString(),
        endsAt:   new Date(receipts[i].paid_at).toISOString(),
        planName: receipts[i - 1].plan_name,
        daysRenewed: receipts[i - 1].days_renewed,
        sessions: [],
        totalDownloadBytes: 0,
        totalUploadBytes: 0,
      });
    }
    // Earliest cycle (before any renewal)
    if (receipts.length) {
      cycles.push({
        label: 'قبل أول تجديد',
        startsAt: null,
        endsAt:   new Date(receipts[0].paid_at).toISOString(),
        planName: null,
        daysRenewed: null,
        sessions: [],
        totalDownloadBytes: 0,
        totalUploadBytes: 0,
      });
    }

    // Bucket each session by its start time
    for (const s of sessions) {
      const t = s.acctstarttime ? new Date(s.acctstarttime).getTime() : 0;
      for (const c of cycles) {
        const start = c.startsAt ? new Date(c.startsAt).getTime() : -Infinity;
        const end   = c.endsAt   ? new Date(c.endsAt).getTime()   :  Infinity;
        if (t >= start && t < end) {
          c.sessions.push({
            startTime:     s.acctstarttime,
            stopTime:      s.acctstoptime,
            ip:            s.framedipaddress,
            nasIp:         s.nasipaddress,
            uploadBytes:   Number(s.acctinputoctets  ?? 0),
            downloadBytes: Number(s.acctoutputoctets ?? 0),
            durationSec:   Number(s.acctsessiontime  ?? 0),
            terminateCause: s.acctterminatecause,
          });
          c.totalDownloadBytes += Number(s.acctoutputoctets ?? 0);
          c.totalUploadBytes   += Number(s.acctinputoctets  ?? 0);
          break;
        }
      }
    }
    // Drop empty cycles older than current
    return cycles.filter((c, i) => i === 0 || c.sessions.length > 0);
  }

  /** Soft-delete: archive the subscriber + strip RADIUS auth so they can't
   *  log in. All data stays in DB and is restorable via /restore. */
  async remove(username: string, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('يجب تحديد العميل');
    const profile = await this.profileRepo.findOne({
      where: this.w<UserProfile>(tenantId, { username } as any),
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);
    if (profile.isArchived) return { message: `User '${username}' already archived` };

    await this.dataSource.transaction(async (mgr) => {
      // Remove any auth-granting attribute and place an explicit Reject so
      // FreeRADIUS cannot accept this user regardless of the hotspot profile.
      await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Cleartext-Password' }));
      await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Auth-Type' }));
      await mgr.save(RadCheck, { username, attribute: 'Auth-Type', op: ':=', value: 'Reject', tenantId });
      profile.isArchived = true;
      profile.isSuspended = false;
      await mgr.save(UserProfile, profile);
    });
    // Drop the live session so the user falls offline immediately
    await this.kickUser(username, tenantId).catch(() => { /* best-effort */ });
    return { message: `User '${username}' archived` };
  }

  /** Restore an archived subscriber: re-add Cleartext-Password = original or username. */
  async restore(username: string, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('يجب تحديد العميل');
    const profile = await this.profileRepo.findOne({
      where: this.w<UserProfile>(tenantId, { username } as any),
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);
    if (!profile.isArchived) return profile;

    await this.dataSource.transaction(async (mgr) => {
      // Clear any Reject and start passwordless — the operator's preference is
      // that restored users authenticate without a password by default.
      await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Auth-Type' }));
      await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Cleartext-Password' }));
      await mgr.save(RadCheck, {
        username, attribute: 'Auth-Type', op: ':=', value: 'Accept', tenantId,
      });
      profile.isArchived = false;
      await mgr.save(UserProfile, profile);
    });
    return { message: `User '${username}' restored` };
  }

  /** Suspend = block login without archiving. The subscriber stays in the
   *  active list with a "موقوف مؤقتاً" badge. */
  async suspend(username: string, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('يجب تحديد العميل');
    const profile = await this.profileRepo.findOne({
      where: this.w<UserProfile>(tenantId, { username } as any),
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);
    if (profile.isSuspended) return profile;

    await this.dataSource.transaction(async (mgr) => {
      await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Cleartext-Password' }));
      await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Auth-Type' }));
      await mgr.save(RadCheck, { username, attribute: 'Auth-Type', op: ':=', value: 'Reject', tenantId });
      profile.isSuspended = true;
      await mgr.save(UserProfile, profile);
    });
    // Drop the live session so the user falls offline immediately
    await this.kickUser(username, tenantId).catch(() => { /* best-effort */ });
    return { message: `User '${username}' suspended` };
  }

  /** Resume a suspended subscriber: re-add Cleartext-Password. */
  async resume(username: string, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('يجب تحديد العميل');
    const profile = await this.profileRepo.findOne({
      where: this.w<UserProfile>(tenantId, { username } as any),
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);
    if (!profile.isSuspended) return profile;

    await this.dataSource.transaction(async (mgr) => {
      // Clear any Reject and start passwordless on resume — matches restore().
      await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Auth-Type' }));
      await mgr.delete(RadCheck, this.w<RadCheck>(tenantId, { username, attribute: 'Cleartext-Password' }));
      await mgr.save(RadCheck, {
        username, attribute: 'Auth-Type', op: ':=', value: 'Accept', tenantId,
      });
      profile.isSuspended = false;
      await mgr.save(UserProfile, profile);
    });
    return { message: `User '${username}' resumed` };
  }

  /** Manually bump the displayed consumption by `addGb` gigabytes — used when
   *  migrating a subscriber from another system that already counted X GB
   *  against their plan. We shift `quota_baseline_out_bytes` down by the same
   *  amount so the next syncAllUsage preserves the new total:
   *      total = max(0, SUM(radacct) - (baseline - X)) = (prev_total + X) ✓
   *  Negative values are allowed (e.g. "give back 5GB" → addGb = -5). */
  async adjustUsage(username: string, addGb: number, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('يجب تحديد العميل');
    if (!Number.isFinite(addGb) || addGb === 0) {
      throw new BadRequestException('قيمة التعديل غير صحيحة');
    }
    const profile = await this.profileRepo.findOne({
      where: this.w<UserProfile>(tenantId, { username } as any),
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);

    const deltaBytes = BigInt(Math.round(addGb * 1024 ** 3));
    // Atomically: bump total by delta AND shift baseline by -delta so the
    // next sync recomputes the same number.
    await this.dataSource.query(
      `INSERT INTO user_data_usage
         (username, tenant_id, total_download_bytes, total_upload_bytes,
          quota_baseline_out_bytes, quota_baseline_in_bytes, updated_at, quota_reset_at)
       VALUES ($1, $2, GREATEST(0, $3::bigint), 0, -$3::bigint, 0, NOW(), '1970-01-01')
       ON CONFLICT (username, COALESCE(tenant_id, -1)) DO UPDATE SET
         total_download_bytes     = GREATEST(0, COALESCE(user_data_usage.total_download_bytes, 0) + $3::bigint),
         quota_baseline_out_bytes = COALESCE(user_data_usage.quota_baseline_out_bytes, 0) - $3::bigint,
         updated_at               = NOW()`,
      [username, tenantId, String(deltaBytes)],
    );
    return { message: `Usage adjusted by ${addGb} GB for '${username}'`, deltaBytes: String(deltaBytes) };
  }

  /** Clear ALL RADIUS session history (radacct) for the subscriber WITHOUT
   *  resetting their consumption counter. We shift `quota_baseline_*` so that
   *  the next syncAllUsage computes the same total against an empty radacct:
   *      total = SUM(radacct=0) - (-current_total) = current_total ✓
   *  Sales receipts, plan, baselines for renewal, and bytes shown to the admin
   *  all stay intact. Only the per-session breakdown is lost. */
  async clearSessions(username: string, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('يجب تحديد العميل');
    const profile = await this.profileRepo.findOne({
      where: this.w<UserProfile>(tenantId, { username } as any),
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);

    await this.dataSource.transaction(async (mgr) => {
      // 1) Read the current displayed totals
      const usage: { dl: string; ul: string }[] = await mgr.query(
        `SELECT COALESCE(total_download_bytes, 0)::bigint AS dl,
                COALESCE(total_upload_bytes,   0)::bigint AS ul
           FROM user_data_usage
          WHERE username = $1 AND COALESCE(tenant_id, -1) = COALESCE($2, -1)`,
        [username, tenantId],
      );
      const dl = usage[0]?.dl ?? '0';
      const ul = usage[0]?.ul ?? '0';

      // 2) Flip the baselines to negative so the next sync recomputes the same total
      await mgr.query(
        `UPDATE user_data_usage
            SET quota_baseline_out_bytes = -$1::bigint,
                quota_baseline_in_bytes  = -$2::bigint,
                updated_at = NOW()
          WHERE username = $3 AND COALESCE(tenant_id, -1) = COALESCE($4, -1)`,
        [dl, ul, username, tenantId],
      );

      // 3) Delete the radacct history
      await mgr.query(
        `DELETE FROM radacct WHERE username = $1 AND COALESCE(tenant_id, -1) = COALESCE($2, -1)`,
        [username, tenantId],
      );
    });

    return { message: `Sessions cleared for '${username}' (consumption preserved)` };
  }

  /** Hard-delete — only allowed on archived subscribers. */
  async removePermanent(username: string, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('يجب تحديد العميل');
    const profile = await this.profileRepo.findOne({
      where: this.w<UserProfile>(tenantId, { username } as any),
    });
    if (!profile) throw new NotFoundException(`User '${username}' not found`);
    if (!profile.isArchived) {
      throw new ConflictException('يجب أرشفة المشترك أولاً قبل الحذف النهائي');
    }
    await this.dataSource.transaction(async (mgr) => {
      await mgr.delete(RadCheck,     this.w<RadCheck>(tenantId, { username }));
      await mgr.delete(RadReply,     this.w<RadReply>(tenantId, { username }));
      await mgr.delete(RadUserGroup, this.w<RadUserGroup>(tenantId, { username }));
      // Wipe per-tenant accounting & topup baggage so the bonus pool doesn't
      // "resurrect" when a username gets re-created later.
      await mgr.query(
        `DELETE FROM user_topups WHERE username = $1 AND COALESCE(tenant_id,-1) = COALESCE($2,-1)`,
        [username, tenantId],
      );
      await mgr.query(
        `DELETE FROM user_data_usage WHERE username = $1 AND COALESCE(tenant_id,-1) = COALESCE($2,-1)`,
        [username, tenantId],
      );
      await mgr.query(
        `DELETE FROM radacct WHERE username = $1 AND COALESCE(tenant_id,-1) = COALESCE($2,-1)`,
        [username, tenantId],
      );
      await mgr.remove(UserProfile, profile);
    });
    return { message: `User '${username}' permanently deleted` };
  }
}
