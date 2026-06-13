import { Injectable, OnModuleInit, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Plan } from '../../database/entities/plan.entity';
import { RadCheck } from '../../database/entities/radcheck.entity';
import { RadReply } from '../../database/entities/radreply.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { UserDataUsage } from '../../database/entities/user-data-usage.entity';
import { Nas } from '../../database/entities/nas.entity';
import { spawn } from 'child_process';
import { VoucherCardsService } from '../voucher-cards/voucher-cards.service';

@Injectable()
export class QuotaEnforcerService implements OnModuleInit {
  private readonly logger = new Logger(QuotaEnforcerService.name);

  constructor(
    @InjectRepository(Plan)          private readonly planRepo: Repository<Plan>,
    @InjectRepository(RadCheck)      private readonly radCheckRepo: Repository<RadCheck>,
    @InjectRepository(RadReply)      private readonly radReplyRepo: Repository<RadReply>,
    @InjectRepository(UserProfile)   private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(UserDataUsage) private readonly usageRepo: Repository<UserDataUsage>,
    @InjectRepository(Nas)           private readonly nasRepo: Repository<Nas>,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => VoucherCardsService))
    private readonly voucherCardsService: VoucherCardsService,
  ) {}

  onModuleInit() {
    // Sync + enforce every 60 seconds
    setInterval(() => this.syncAndEnforce().catch(e => this.logger.error(e)), 60_000);
    // First run after 15s
    setTimeout(() => this.syncAndEnforce().catch(e => this.logger.error(e)), 15_000);

    // Activate first-use cards every 10 seconds (independent fast loop)
    setInterval(
      () => this.voucherCardsService.activateFirstUseCards().catch(e => this.logger.error(e)),
      10_000,
    );
  }

  // ── Public: sync on demand (called after kick/reconnect) ──────────────────

  async syncUsage(username: string, tenantId: number | null): Promise<void> {
    // Filter radacct by tenant_id to isolate bytes per tenant — same username
    // on different tenants gets independent quota tracking.
    await this.dataSource.query(`
      INSERT INTO user_data_usage (username, tenant_id, total_download_bytes, total_upload_bytes, updated_at)
      VALUES (
        $1::text, $2,
        GREATEST(0, (SELECT COALESCE(SUM(acctoutputoctets),0)::bigint FROM radacct WHERE username = $1::text AND COALESCE(tenant_id,-1) = COALESCE($2,-1))
          - COALESCE((SELECT quota_baseline_out_bytes FROM user_data_usage WHERE username=$1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)),0)),
        GREATEST(0, (SELECT COALESCE(SUM(acctinputoctets), 0)::bigint FROM radacct WHERE username = $1::text AND COALESCE(tenant_id,-1) = COALESCE($2,-1))
          - COALESCE((SELECT quota_baseline_in_bytes  FROM user_data_usage WHERE username=$1::text AND COALESCE(tenant_id,-1)=COALESCE($2,-1)),0)),
        NOW()
      )
      ON CONFLICT (username, COALESCE(tenant_id, -1)) DO UPDATE SET
        total_download_bytes = EXCLUDED.total_download_bytes,
        total_upload_bytes   = EXCLUDED.total_upload_bytes,
        updated_at           = EXCLUDED.updated_at
    `, [username, tenantId]);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  private async syncAndEnforce(): Promise<void> {
    await this.expireOldTopups().catch(e => this.logger.error(e));
    await this.syncAllUsage();
    await this.disconnectExpired().catch(e => this.logger.error(e));
    await this.enforce();
    await this.voucherCardsService.activateFirstUseCards().catch(e => this.logger.error(e));
  }

  /**
   * Kick any active session whose subscription has expired
   * (start_date + duration_days < NOW). FreeRADIUS's `expiration` module
   * already blocks the next login attempt — this loop terminates the
   * currently-open session so the user drops immediately instead of
   * staying connected until the NAS times out.
   */
  private async disconnectExpired(): Promise<void> {
    // Join on tenant_id too — same username under another tenant must NOT be
    // considered the same subscriber for expiration checks.
    const rows: { username: string; nasipaddress: string; framedipaddress: string | null; tenant_id: number | null }[] =
      await this.dataSource.query(`
        SELECT ra.username, ra.nasipaddress, ra.framedipaddress, ra.tenant_id
        FROM radacct ra
        JOIN user_profiles up
          ON up.username = ra.username
         AND COALESCE(up.tenant_id, -1) = COALESCE(ra.tenant_id, -1)
        WHERE ra.acctstoptime IS NULL
          AND up.is_archived  = false
          AND up.is_suspended = false
          AND (
            ra.acctupdatetime > NOW() - INTERVAL '10 minutes'
            OR (ra.acctupdatetime IS NULL AND ra.acctstarttime > NOW() - INTERVAL '10 minutes')
          )
          AND (up.start_date::date + up.duration_days * INTERVAL '1 day') < NOW()
      `);
    if (!rows.length) return;

    for (const r of rows) {
      // Lookup NAS within the session's tenant when known — duplicate IPs across
      // tenants would otherwise resolve to the wrong secret.
      const nas = await this.nasRepo.findOne({
        where: r.tenant_id
          ? { nasname: r.nasipaddress, tenantId: r.tenant_id }
          : { nasname: r.nasipaddress },
      });
      if (!nas?.secret) continue;
      const attrs = `User-Name=${r.username}\n` + (r.framedipaddress ? `Framed-IP-Address=${r.framedipaddress}\n` : '');
      const sent = await this.sendPacket('disconnect', r.nasipaddress, nas.secret, attrs).catch(() => 'noreply');
      this.logger.log(`Expired subscription kicked: ${r.username} (tenant=${r.tenant_id ?? '-'}) from ${r.nasipaddress} → ${sent}`);
    }
  }

  /** Remove topups past their expires_at — bonus pools shrink and rows disappear */
  private async expireOldTopups(): Promise<void> {
    // Find expired topups, group by user, sum the bytes to deduct
    const expired: { id: number; username: string; tenant_id: number | null; size_gb: string }[] =
      await this.dataSource.query(
        `SELECT id, username, tenant_id, size_gb
         FROM user_topups
         WHERE expires_at IS NOT NULL AND expires_at <= NOW()`,
      );
    if (!expired.length) return;

    // Aggregate bytes per (username, tenant_id) for profile adjustment
    const totals: Record<string, bigint> = {};
    for (const t of expired) {
      const key = `${t.username}|${t.tenant_id ?? -1}`;
      const bytes = BigInt(Math.floor(Number(t.size_gb) * 1024 ** 3));
      totals[key] = (totals[key] ?? 0n) + bytes;
    }

    await this.dataSource.transaction(async (m) => {
      // Delete expired topup rows
      await m.query(
        `DELETE FROM user_topups WHERE id = ANY($1::int[])`,
        [expired.map(t => t.id)],
      );
      // Adjust profile.bonus_remaining_bytes
      for (const [key, bytes] of Object.entries(totals)) {
        const [username, tenantStr] = key.split('|');
        const tenantId = tenantStr === '-1' ? null : Number(tenantStr);
        const where = tenantId !== null
          ? `username = $1 AND tenant_id = $3`
          : `username = $1 AND tenant_id IS NULL`;
        const params = tenantId !== null ? [username, String(bytes), tenantId] : [username, String(bytes)];
        await m.query(
          `UPDATE user_profiles
             SET bonus_remaining_bytes = GREATEST(0, COALESCE(bonus_remaining_bytes,0)::bigint - $2::bigint)
           WHERE ${where}`,
          params,
        );
      }
    });

    this.logger.log(`Expired ${expired.length} topup(s) — bonus pools adjusted`);
  }

  async syncAllUsage(): Promise<void> {
    // Per-tenant isolation: join radacct on tenant_id so bytes from one
    // tenant's NAS never bleed into another tenant's quota.
    await this.dataSource.query(`
      INSERT INTO user_data_usage (username, tenant_id, total_download_bytes, total_upload_bytes, updated_at)
      SELECT
        up.username,
        up.tenant_id,
        GREATEST(0, COALESCE(SUM(ra.acctoutputoctets), 0)::bigint - COALESCE(u2.quota_baseline_out_bytes, 0)),
        GREATEST(0, COALESCE(SUM(ra.acctinputoctets),  0)::bigint - COALESCE(u2.quota_baseline_in_bytes,  0)),
        NOW()
      FROM user_profiles up
      LEFT JOIN radacct ra ON ra.username = up.username
        AND COALESCE(ra.tenant_id, -1) = COALESCE(up.tenant_id, -1)
      LEFT JOIN user_data_usage u2 ON u2.username = up.username
        AND COALESCE(u2.tenant_id,-1) = COALESCE(up.tenant_id,-1)
      WHERE up.is_archived = false
      GROUP BY up.username, up.tenant_id, u2.quota_baseline_out_bytes, u2.quota_baseline_in_bytes
      ON CONFLICT (username, COALESCE(tenant_id, -1)) DO UPDATE SET
        total_download_bytes = EXCLUDED.total_download_bytes,
        total_upload_bytes   = EXCLUDED.total_upload_bytes,
        updated_at           = EXCLUDED.updated_at
    `);

    // Same sync for voucher cards
    await this.dataSource.query(`
      INSERT INTO user_data_usage (username, tenant_id, total_download_bytes, total_upload_bytes, updated_at)
      SELECT
        vc.code,
        vc.tenant_id,
        GREATEST(0, COALESCE(SUM(ra.acctoutputoctets), 0)::bigint - COALESCE(u2.quota_baseline_out_bytes, 0)),
        GREATEST(0, COALESCE(SUM(ra.acctinputoctets),  0)::bigint - COALESCE(u2.quota_baseline_in_bytes,  0)),
        NOW()
      FROM voucher_cards vc
      LEFT JOIN radacct ra ON ra.username = vc.code
        AND COALESCE(ra.tenant_id, -1) = COALESCE(vc.tenant_id, -1)
      LEFT JOIN user_data_usage u2 ON u2.username = vc.code
        AND COALESCE(u2.tenant_id,-1) = COALESCE(vc.tenant_id,-1)
      WHERE vc.status IN ('active','unused')
      GROUP BY vc.code, vc.tenant_id, u2.quota_baseline_out_bytes, u2.quota_baseline_in_bytes
      ON CONFLICT (username, COALESCE(tenant_id, -1)) DO UPDATE SET
        total_download_bytes = EXCLUDED.total_download_bytes,
        total_upload_bytes   = EXCLUDED.total_upload_bytes,
        updated_at           = EXCLUDED.updated_at
    `);
  }

  private async enforce(): Promise<void> {
    // Write a heartbeat marker so we can verify the loop is actually firing
    try { require('fs').appendFileSync('/tmp/quota-enforce.log', `[${new Date().toISOString()}] enforce() called\n`); } catch {}
    // Find users whose cumulative usage >= plan limit (active OR offline — we
    // need to block re-auth too, otherwise the user just reconnects after kick).
    const rows: {
      username: string;
      tenant_id: number | null;
      total_download_bytes: string;
    }[] = await this.dataSource.query(`
      SELECT u.username, u.tenant_id, u.total_download_bytes
      FROM user_data_usage u
      JOIN user_profiles up ON up.username = u.username
        AND (up.tenant_id = u.tenant_id OR (up.tenant_id IS NULL AND u.tenant_id IS NULL))
      JOIN plans p ON p.id = up.plan_id
      WHERE p.quota_action != 'none'
        AND up.is_archived  = false
        AND up.is_suspended = false
        AND (
          (p.total_limit_gb IS NOT NULL AND p.total_limit_gb > 0
            AND (u.total_download_bytes + u.total_upload_bytes) >= (p.total_limit_gb * 1024 * 1024 * 1024 + COALESCE(up.bonus_remaining_bytes,0)))
          OR
          (p.download_limit_gb IS NOT NULL AND p.download_limit_gb > 0
            AND u.total_download_bytes >= (p.download_limit_gb * 1024 * 1024 * 1024 + COALESCE(up.bonus_remaining_bytes,0)))
        )
    `);

    try { require('fs').appendFileSync('/tmp/quota-enforce.log', `  over-quota rows: ${rows.length}\n`); } catch {}
    for (const row of rows) {
      try {
        const profile = await this.profileRepo.findOne({
          where: { username: row.username, ...(row.tenant_id ? { tenantId: row.tenant_id } : {}) },
          relations: ['plan'],
        });
        try { require('fs').appendFileSync('/tmp/quota-enforce.log', `  user=${row.username} profile=${!!profile} plan=${!!profile?.plan} action=${profile?.plan?.quotaAction}\n`); } catch {}
        if (!profile?.plan) continue;

        const plan = profile.plan;
        this.logger.log(
          `Quota exceeded: ${row.username} — used ${Number(row.total_download_bytes) / 1024 ** 3}GB / ${plan.downloadLimitGb}GB — action: ${plan.quotaAction}`,
        );

        if (plan.quotaAction === 'disconnect') {
          await this.blockAuth(row.username, row.tenant_id);
          await this.kickUser(row.username, row.tenant_id);
          try { require('fs').appendFileSync('/tmp/quota-enforce.log', `  → blocked + kicked ${row.username}\n`); } catch {}
        } else if (plan.quotaAction === 'switch' && plan.fallbackPlanId) {
          await this.switchPlan(row.username, row.tenant_id, profile, plan.fallbackPlanId);
        }
      } catch (e: any) {
        try { require('fs').appendFileSync('/tmp/quota-enforce.log', `  ERROR for ${row.username}: ${e?.message || e}\n`); } catch {}
      }
    }

    // Voucher cards: enforce quota on cards with active sessions
    const cardRows: {
      code: string;
      tenant_id: number | null;
      total_download_bytes: string;
      plan_name: string;
      quota_action: string;
      download_limit_gb: string | null;
    }[] = await this.dataSource.query(`
      SELECT vc.code, vc.tenant_id, u.total_download_bytes,
             p.name AS plan_name, p.quota_action, p.download_limit_gb
      FROM user_data_usage u
      JOIN voucher_cards vc ON vc.code = u.username
        AND (vc.tenant_id = u.tenant_id OR (vc.tenant_id IS NULL AND u.tenant_id IS NULL))
      JOIN plans p ON p.id = vc.plan_id
      WHERE p.quota_action != 'none'
        AND (
          (p.total_limit_gb IS NOT NULL AND p.total_limit_gb > 0
            AND (u.total_download_bytes + u.total_upload_bytes) >= (p.total_limit_gb * 1024 * 1024 * 1024))
          OR
          (p.download_limit_gb IS NOT NULL AND p.download_limit_gb > 0
            AND u.total_download_bytes >= (p.download_limit_gb * 1024 * 1024 * 1024))
        )
        AND EXISTS (
          SELECT 1 FROM radacct ra
          WHERE ra.username = vc.code AND ra.acctstoptime IS NULL
        )
    `);

    for (const row of cardRows) {
      this.logger.log(
        `Card quota exceeded: ${row.code} (plan: ${row.plan_name}) — used ${Number(row.total_download_bytes) / 1024 ** 3}GB / ${row.download_limit_gb}GB — action: ${row.quota_action}`,
      );
      if (row.quota_action === 'disconnect' || row.quota_action === 'switch') {
        // Mark card as expired + strip radcheck/radusergroup so it can't re-auth
        await this.dataSource.query(
          `UPDATE voucher_cards SET status = 'expired' WHERE code = $1`,
          [row.code],
        );
        await this.dataSource.query(
          `DELETE FROM radcheck WHERE username = $1 AND COALESCE(tenant_id,-1) = COALESCE($2,-1)`,
          [row.code, row.tenant_id],
        );
        await this.dataSource.query(
          `DELETE FROM radusergroup WHERE username = $1 AND COALESCE(tenant_id,-1) = COALESCE($2,-1)`,
          [row.code, row.tenant_id],
        );
        await this.kickUser(row.code, row.tenant_id);
      }
    }
  }

  // ── Plan switch ───────────────────────────────────────────────────────────

  private async switchPlan(
    username: string,
    tenantId: number | null,
    profile: UserProfile,
    fallbackPlanId: number,
  ): Promise<void> {
    const fallback = await this.planRepo.findOne({ where: { id: fallbackPlanId } });
    if (!fallback) return;

    // Remember the original plan only if not already on fallback (avoid overwriting on repeated switches)
    if (profile.originalPlanId == null && profile.planId !== fallbackPlanId) {
      profile.originalPlanId = profile.planId;
    }
    profile.planId = fallbackPlanId;
    await this.profileRepo.save(profile);

    const w = tenantId ? { username, tenantId } : { username };

    await this.radReplyRepo.delete(w as any);
    const replyAttrs = this.buildAttrs(fallback, tenantId, username);
    if (replyAttrs.length) await this.radReplyRepo.save(replyAttrs);

    const QUOTA_ATTRS = ['Mikrotik-Recv-Limit','Mikrotik-Recv-Limit-Gigawords','Mikrotik-Xmit-Limit','Mikrotik-Xmit-Limit-Gigawords'];
    for (const a of QUOTA_ATTRS) await this.radCheckRepo.delete({ ...(w as any), attribute: a });
    const checkAttrs = replyAttrs
      .filter(a => QUOTA_ATTRS.includes(a.attribute))
      .map(a => ({ ...a, op: ':=' }));
    if (checkAttrs.length) await this.radCheckRepo.save(checkAttrs);

    await this.sendCoA(username, fallback, 0n, tenantId);
    this.logger.log(`Switched ${username} to fallback plan: ${fallback.name}`);
  }

  // ── Attribute builder ─────────────────────────────────────────────────────

  private buildAttrs(plan: Plan, tenantId: number | null, username: string, bonusBytes: bigint = 0n) {
    const attrs: any[] = [];
    const dl = Number(plan.downloadMbps ?? 0);
    const ul = Number(plan.uploadMbps ?? 0);
    const bdl = Number(plan.burstDownloadMbps ?? 0);
    const bul = Number(plan.burstUploadMbps ?? 0);
    if (dl > 0 || ul > 0 || bdl > 0 || bul > 0) {
      const fmt = (n: number) => n <= 0 ? '0' : Number.isInteger(n) ? `${Math.round(n)}M` : `${Math.round(n * 1000)}k`;
      const base = `${fmt(ul)}/${fmt(dl)}`;
      let rateLimit = base;
      if (bdl > 0 && bul > 0) {
        const burst     = `${fmt(bul)}/${fmt(bdl)}`;
        const threshold = `${fmt(Number(plan.burstThresholdUploadMbps ?? ul))}/${fmt(Number(plan.burstThresholdDownloadMbps ?? dl))}`;
        const time      = String(plan.burstTimeSeconds ?? 8);
        rateLimit = `${base} ${burst} ${threshold} ${time}`;
      }
      attrs.push({ username, attribute: 'Mikrotik-Rate-Limit', op: '=', value: rateLimit, tenantId });
    }
    if (plan.framedPool) {
      attrs.push({ username, attribute: 'Framed-Pool', op: '=', value: plan.framedPool, tenantId });
    }
    const GIGAWORD = 4294967296n;
    if (plan.downloadLimitGb && Number(plan.downloadLimitGb) > 0) {
      const total = BigInt(Math.floor(Number(plan.downloadLimitGb) * 1024 ** 3)) + bonusBytes;
      const giga  = total / GIGAWORD;
      const rem   = total % GIGAWORD;
      if (rem > 0n) attrs.push({ username, attribute: 'Mikrotik-Recv-Limit', op: '=', value: String(rem), tenantId });
      if (giga > 0n) attrs.push({ username, attribute: 'Mikrotik-Recv-Limit-Gigawords', op: '=', value: String(giga), tenantId });
    }
    if (plan.uploadLimitGb && Number(plan.uploadLimitGb) > 0) {
      const total = BigInt(Math.floor(Number(plan.uploadLimitGb) * 1024 ** 3)) + bonusBytes;
      const giga  = total / GIGAWORD;
      const rem   = total % GIGAWORD;
      if (rem > 0n) attrs.push({ username, attribute: 'Mikrotik-Xmit-Limit', op: '=', value: String(rem), tenantId });
      if (giga > 0n) attrs.push({ username, attribute: 'Mikrotik-Xmit-Limit-Gigawords', op: '=', value: String(giga), tenantId });
    }
    if (plan.sessionTimeoutMin && Number(plan.sessionTimeoutMin) > 0) {
      attrs.push({ username, attribute: 'Session-Timeout', op: '=',
        value: String(Number(plan.sessionTimeoutMin) * 60), tenantId });
    }
    return attrs;
  }

  // ── Auth blocking (quota exhausted) ───────────────────────────────────────

  // Use an impossible Calling-Station-Id match to block — leaves the user's
  // original Auth-Type/Cleartext-Password intact so removing the block restores
  // normal authentication.
  private static BLOCK_MARKER = '__QUOTA_EXHAUSTED__';

  /** Block future re-auth — adds a Calling-Station-Id check that can't match */
  async blockAuth(username: string, tenantId: number | null): Promise<void> {
    if (tenantId !== null) {
      await this.dataSource.query(
        `DELETE FROM radcheck WHERE username = $1 AND attribute = 'Calling-Station-Id' AND value = $2 AND tenant_id = $3`,
        [username, QuotaEnforcerService.BLOCK_MARKER, tenantId],
      );
      await this.dataSource.query(
        `INSERT INTO radcheck (username, attribute, op, value, tenant_id)
         VALUES ($1, 'Calling-Station-Id', '==', $2, $3)`,
        [username, QuotaEnforcerService.BLOCK_MARKER, tenantId],
      );
      await this.dataSource.query(
        `DELETE FROM radreply WHERE username = $1 AND attribute = 'Reply-Message' AND tenant_id = $2`,
        [username, tenantId],
      );
      await this.dataSource.query(
        `INSERT INTO radreply (username, attribute, op, value, tenant_id)
         VALUES ($1, 'Reply-Message', ':=', 'تم استنفاد الكوتا — جدد اشتراكك', $2)`,
        [username, tenantId],
      );
    } else {
      await this.dataSource.query(
        `DELETE FROM radcheck WHERE username = $1 AND attribute = 'Calling-Station-Id' AND value = $2 AND tenant_id IS NULL`,
        [username, QuotaEnforcerService.BLOCK_MARKER],
      );
      await this.dataSource.query(
        `INSERT INTO radcheck (username, attribute, op, value, tenant_id)
         VALUES ($1, 'Calling-Station-Id', '==', $2, NULL)`,
        [username, QuotaEnforcerService.BLOCK_MARKER],
      );
      await this.dataSource.query(
        `DELETE FROM radreply WHERE username = $1 AND attribute = 'Reply-Message' AND tenant_id IS NULL`,
        [username],
      );
      await this.dataSource.query(
        `INSERT INTO radreply (username, attribute, op, value, tenant_id)
         VALUES ($1, 'Reply-Message', ':=', 'تم استنفاد الكوتا — جدد اشتراكك', NULL)`,
        [username],
      );
    }
    this.logger.log(`Auth blocked for ${username} (quota exhausted)`);
  }

  /** Remove the auth block (called on renewal/plan change) */
  async unblockAuth(username: string, tenantId: number | null): Promise<void> {
    if (tenantId !== null) {
      await this.dataSource.query(
        `DELETE FROM radcheck WHERE username = $1 AND attribute = 'Calling-Station-Id' AND value = $2 AND tenant_id = $3`,
        [username, QuotaEnforcerService.BLOCK_MARKER, tenantId],
      );
      await this.dataSource.query(
        `DELETE FROM radreply WHERE username = $1 AND attribute = 'Reply-Message' AND tenant_id = $2`,
        [username, tenantId],
      );
    } else {
      await this.dataSource.query(
        `DELETE FROM radcheck WHERE username = $1 AND attribute = 'Calling-Station-Id' AND value = $2 AND tenant_id IS NULL`,
        [username, QuotaEnforcerService.BLOCK_MARKER],
      );
      await this.dataSource.query(
        `DELETE FROM radreply WHERE username = $1 AND attribute = 'Reply-Message' AND tenant_id IS NULL`,
        [username],
      );
    }
  }

  // ── CoA / Disconnect ──────────────────────────────────────────────────────

  async sendCoAForPlan(username: string, plan: Plan, bonusBytes: bigint = 0n, tenantId?: number | null): Promise<void> {
    return this.sendCoA(username, plan, bonusBytes, tenantId);
  }

  private async sendCoA(username: string, plan: Plan, bonusBytes: bigint = 0n, tenantId?: number | null): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT nasipaddress, framedipaddress, acctsessionid, tenant_id FROM radacct
       WHERE username = $1 AND acctstoptime IS NULL
         AND COALESCE(tenant_id,-1) = COALESCE($2,-1)
       ORDER BY acctstarttime DESC LIMIT 1`,
      [username, tenantId ?? null],
    );
    if (!rows.length) {
      this.logger.warn(`CoA skipped: no active session for ${username}`);
      return;
    }

    const nasIp    = String(rows[0].nasipaddress).split('/')[0];
    const framedIp = String(rows[0].framedipaddress).split('/')[0];
    const sessionId = rows[0].acctsessionid;
    const sessionTenant = rows[0].tenant_id as number | null;

    const attrs = this.buildAttrs(plan, null, username, bonusBytes);
    const attrLines = attrs.map(a => `${a.attribute} ${a.op} "${a.value}"`).join('\n');
    const pkt = `User-Name = "${username}"\nAcct-Session-Id = "${sessionId}"\nFramed-IP-Address = ${framedIp}${attrLines ? '\n' + attrLines : ''}`;

    this.logger.log(`CoA → ${username} @ ${nasIp} (${attrs.length} attrs): ${attrs.map(a => `${a.attribute}=${a.value}`).join(', ')}`);
    for (const { ip, secret } of await this.nasCandidates(nasIp, sessionTenant)) {
      const result = await this.sendPacket('coa', ip, secret, pkt);
      this.logger.log(`CoA result for ${username} @ ${ip}: ${result}`);
      if (result === 'ack') return;
    }
    this.logger.warn(`CoA failed for ${username}: no ACK from any NAS`);
  }

  async kickUser(username: string, tenantId?: number | null): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT nasipaddress, framedipaddress, acctsessionid, tenant_id FROM radacct
       WHERE username = $1 AND acctstoptime IS NULL
         AND COALESCE(tenant_id,-1) = COALESCE($2,-1)
       ORDER BY acctstarttime DESC LIMIT 1`,
      [username, tenantId ?? null],
    );
    if (!rows.length) return;

    const nasIp    = String(rows[0].nasipaddress).split('/')[0];
    const framedIp = String(rows[0].framedipaddress).split('/')[0];
    const sessionTenant = rows[0].tenant_id as number | null;

    const attrSets = [
      `User-Name = "${username}"\nFramed-IP-Address = ${framedIp}`,
      `Framed-IP-Address = ${framedIp}`,
    ];

    for (const { ip, secret } of await this.nasCandidates(nasIp, sessionTenant)) {
      for (const attrs of attrSets) {
        if (await this.sendPacket('disconnect', ip, secret, attrs) === 'ack') return;
      }
    }
  }

  private async nasCandidates(sessionNasIp: string, tenantId?: number | null) {
    const allNas = await this.nasRepo.find(tenantId ? { where: { tenantId } } : undefined);
    const seen = new Set<string>();
    const list: { ip: string; secret: string }[] = [];
    const add = (ip: string, secret: string) => {
      const clean = ip.split('/')[0];
      if (!seen.has(clean)) { seen.add(clean); list.push({ ip: clean, secret }); }
    };
    const exact = allNas.find(n => n.nasname.split('/')[0] === sessionNasIp);
    if (exact) add(exact.nasname, exact.secret);
    add(sessionNasIp, allNas[0]?.secret ?? 'testing123');
    for (const n of allNas) add(n.nasname, n.secret);
    return list;
  }

  private sendPacket(
    type: 'disconnect' | 'coa',
    nasIp: string,
    secret: string,
    attrs: string,
  ): Promise<'ack' | 'nak' | 'noreply'> {
    return new Promise((resolve) => {
      const proc = spawn('radclient', ['-t', '3', '-r', '1', `${nasIp}:3799`, type, secret]);
      let out = '';
      proc.stdin.write(attrs);
      proc.stdin.end();
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.stderr.on('data', (d) => { out += d.toString(); });
      proc.on('close', () => {
        if (out.includes('-ACK')) resolve('ack');
        else if (out.includes('-NAK')) resolve('nak');
        else resolve('noreply');
      });
      proc.on('error', () => resolve('noreply'));
    });
  }
}

