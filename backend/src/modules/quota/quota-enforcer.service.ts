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
    // Filter by radacctid (auto-increment, timezone-independent). Renewal sets
    // quota_reset_radacct_id = MAX(radacctid) AND kicks the user, so any session
    // started after renewal has radacctid > that value.
    await this.dataSource.query(`
      INSERT INTO user_data_usage (username, tenant_id, total_download_bytes, total_upload_bytes, updated_at)
      VALUES (
        $1, $2,
        (SELECT COALESCE(SUM(acctoutputoctets),0)::bigint FROM radacct WHERE username = $1
           AND radacctid > COALESCE((SELECT quota_reset_radacct_id FROM user_data_usage WHERE username=$1 AND COALESCE(tenant_id,-1)=COALESCE($2,-1)),0)),
        (SELECT COALESCE(SUM(acctinputoctets), 0)::bigint FROM radacct WHERE username = $1
           AND radacctid > COALESCE((SELECT quota_reset_radacct_id FROM user_data_usage WHERE username=$1 AND COALESCE(tenant_id,-1)=COALESCE($2,-1)),0)),
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
    await this.syncAllUsage();
    await this.enforce();
    await this.voucherCardsService.activateFirstUseCards().catch(e => this.logger.error(e));
  }

  private async syncAllUsage(): Promise<void> {
    // Filter by radacctid (auto-increment, timezone-independent). Avoids MikroTik
    // clock skew issues where acctstarttime can be hours ahead/behind real time.
    await this.dataSource.query(`
      INSERT INTO user_data_usage (username, tenant_id, total_download_bytes, total_upload_bytes, updated_at)
      SELECT
        up.username,
        up.tenant_id,
        COALESCE(SUM(ra.acctoutputoctets), 0)::bigint,
        COALESCE(SUM(ra.acctinputoctets),  0)::bigint,
        NOW()
      FROM user_profiles up
      LEFT JOIN radacct ra ON ra.username = up.username
        AND ra.radacctid > COALESCE(
          (SELECT quota_reset_radacct_id FROM user_data_usage u2
           WHERE u2.username = up.username
             AND COALESCE(u2.tenant_id,-1) = COALESCE(up.tenant_id,-1)),
          0
        )
      GROUP BY up.username, up.tenant_id
      ON CONFLICT (username, COALESCE(tenant_id, -1)) DO UPDATE SET
        total_download_bytes = EXCLUDED.total_download_bytes,
        total_upload_bytes   = EXCLUDED.total_upload_bytes,
        updated_at           = EXCLUDED.updated_at
    `);

    // Same sync for voucher cards (code = radius username, not in user_profiles)
    await this.dataSource.query(`
      INSERT INTO user_data_usage (username, tenant_id, total_download_bytes, total_upload_bytes, updated_at)
      SELECT
        vc.code,
        vc.tenant_id,
        COALESCE(SUM(ra.acctoutputoctets), 0)::bigint,
        COALESCE(SUM(ra.acctinputoctets),  0)::bigint,
        NOW()
      FROM voucher_cards vc
      LEFT JOIN radacct ra ON ra.username = vc.code
        AND ra.radacctid > COALESCE(
          (SELECT quota_reset_radacct_id FROM user_data_usage u2
           WHERE u2.username = vc.code
             AND COALESCE(u2.tenant_id,-1) = COALESCE(vc.tenant_id,-1)),
          0
        )
      WHERE vc.status IN ('active','unused')
      GROUP BY vc.code, vc.tenant_id
      ON CONFLICT (username, COALESCE(tenant_id, -1)) DO UPDATE SET
        total_download_bytes = EXCLUDED.total_download_bytes,
        total_upload_bytes   = EXCLUDED.total_upload_bytes,
        updated_at           = EXCLUDED.updated_at
    `);
  }

  private async enforce(): Promise<void> {
    // Find users with active sessions whose cumulative download >= plan limit
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
        AND (
          (p.total_limit_gb IS NOT NULL AND p.total_limit_gb > 0
            AND (u.total_download_bytes + u.total_upload_bytes) >= (p.total_limit_gb * 1024 * 1024 * 1024 + COALESCE(up.bonus_remaining_bytes,0)))
          OR
          (p.download_limit_gb IS NOT NULL AND p.download_limit_gb > 0
            AND u.total_download_bytes >= (p.download_limit_gb * 1024 * 1024 * 1024 + COALESCE(up.bonus_remaining_bytes,0)))
        )
        AND EXISTS (
          SELECT 1 FROM radacct ra
          WHERE ra.username = u.username AND ra.acctstoptime IS NULL
        )
    `);

    for (const row of rows) {
      const profile = await this.profileRepo.findOne({
        where: { username: row.username, ...(row.tenant_id ? { tenantId: row.tenant_id } : {}) },
        relations: ['plan'],
      });
      if (!profile?.plan) continue;

      const plan = profile.plan;
      this.logger.log(
        `Quota exceeded: ${row.username} — used ${Number(row.total_download_bytes) / 1024 ** 3}GB / ${plan.downloadLimitGb}GB — action: ${plan.quotaAction}`,
      );

      if (plan.quotaAction === 'disconnect') {
        await this.kickUser(row.username);
      } else if (plan.quotaAction === 'switch' && plan.fallbackPlanId) {
        await this.switchPlan(row.username, row.tenant_id, profile, plan.fallbackPlanId);
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
          `DELETE FROM radcheck WHERE username = $1`,
          [row.code],
        );
        await this.dataSource.query(
          `DELETE FROM radusergroup WHERE username = $1`,
          [row.code],
        );
        await this.kickUser(row.code);
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

    await this.sendCoA(username, fallback);
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

  // ── CoA / Disconnect ──────────────────────────────────────────────────────

  async sendCoAForPlan(username: string, plan: Plan, bonusBytes: bigint = 0n): Promise<void> {
    return this.sendCoA(username, plan, bonusBytes);
  }

  private async sendCoA(username: string, plan: Plan, bonusBytes: bigint = 0n): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT nasipaddress, framedipaddress, acctsessionid FROM radacct
       WHERE username = $1 AND acctstoptime IS NULL ORDER BY acctstarttime DESC LIMIT 1`,
      [username],
    );
    if (!rows.length) {
      this.logger.warn(`CoA skipped: no active session for ${username}`);
      return;
    }

    const nasIp    = String(rows[0].nasipaddress).split('/')[0];
    const framedIp = String(rows[0].framedipaddress).split('/')[0];
    const sessionId = rows[0].acctsessionid;

    const attrs = this.buildAttrs(plan, null, username, bonusBytes);
    const attrLines = attrs.map(a => `${a.attribute} ${a.op} "${a.value}"`).join('\n');
    const pkt = `User-Name = "${username}"\nAcct-Session-Id = "${sessionId}"\nFramed-IP-Address = ${framedIp}${attrLines ? '\n' + attrLines : ''}`;

    this.logger.log(`CoA → ${username} @ ${nasIp} (${attrs.length} attrs): ${attrs.map(a => `${a.attribute}=${a.value}`).join(', ')}`);
    for (const { ip, secret } of await this.nasCandidates(nasIp)) {
      const result = await this.sendPacket('coa', ip, secret, pkt);
      this.logger.log(`CoA result for ${username} @ ${ip}: ${result}`);
      if (result === 'ack') return;
    }
    this.logger.warn(`CoA failed for ${username}: no ACK from any NAS`);
  }

  async kickUser(username: string): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT nasipaddress, framedipaddress, acctsessionid FROM radacct
       WHERE username = $1 AND acctstoptime IS NULL ORDER BY acctstarttime DESC LIMIT 1`,
      [username],
    );
    if (!rows.length) return;

    const nasIp    = String(rows[0].nasipaddress).split('/')[0];
    const framedIp = String(rows[0].framedipaddress).split('/')[0];

    const attrSets = [
      `User-Name = "${username}"\nFramed-IP-Address = ${framedIp}`,
      `Framed-IP-Address = ${framedIp}`,
    ];

    for (const { ip, secret } of await this.nasCandidates(nasIp)) {
      for (const attrs of attrSets) {
        if (await this.sendPacket('disconnect', ip, secret, attrs) === 'ack') return;
      }
    }
  }

  private async nasCandidates(sessionNasIp: string) {
    const allNas = await this.nasRepo.find();
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
