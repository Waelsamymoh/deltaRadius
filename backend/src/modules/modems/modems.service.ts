import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import * as net from 'net';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, DataSource } from 'typeorm';
import { Modem } from '../../database/entities/modem.entity';
import { Nas } from '../../database/entities/nas.entity';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { SettingsService } from '../settings/settings.service';
import { getTenantId, getScopedTenantId } from '../../common/helpers/tenant.helper';
import { CreateModemDto } from './dto/create-modem.dto';
import { UpdateModemDto } from './dto/update-modem.dto';

export type MikrotikAddress = {
  address: string;    // interface name (e.g. "ether2")
  network: string;    // interface type  (e.g. "ether")
  interface: string;  // running status  (e.g. "true"/"false")
  comment?: string;
  rxByte?: number;    // cumulative bytes received
  txByte?: number;    // cumulative bytes transmitted
};

@Injectable()
export class ModemsService implements OnModuleInit {
  private readonly logger = new Logger(ModemsService.name);

  constructor(
    @InjectRepository(Modem)
    private readonly modemRepo: Repository<Modem>,
    @InjectRepository(Nas)
    private readonly nasRepo: Repository<Nas>,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    // Snapshot consumption every 5 minutes and accumulate per-day deltas.
    setInterval(() => this.pollDailyUsage().catch(e => this.logger.error(`daily poll failed: ${e?.message ?? e}`)), 5 * 60_000);
    // First run shortly after boot.
    setTimeout(() => this.pollDailyUsage().catch(e => this.logger.error(e)), 25_000);
  }

  /**
   * For every tenant's router NAS: read current interface byte counters,
   * compute the delta since the last snapshot, and add it to today's bucket.
   * Counter resets (current < last, e.g. after a manual reset or reboot) are
   * handled by treating the current value itself as the new consumption.
   */
  async pollDailyUsage(): Promise<void> {
    // Bucket consumption by the project's local date (not the DB's UTC date),
    // so the daily total rolls over at the operator's midnight (auto tz or manual).
    const today = await this.settings.getLocalToday();

    const nasList = await this.nasRepo.find({ where: { type: 'router' } as FindOptionsWhere<Nas> });
    for (const nas of nasList) {
      if (!nas.nasname || !nas.sstpUsername || !nas.secret) continue;
      let live: MikrotikAddress[];
      try {
        live = await this.fetchMikrotikAddresses(nas.nasname, nas.sstpUsername, nas.secret);
      } catch {
        continue; // device unreachable — skip this cycle
      }
      const byName = new Map(live.map(i => [i.address, (i.rxByte ?? 0) + (i.txByte ?? 0)]));
      // Only this network's modems (legacy null-nasId modems also matched).
      const tenantModems = await this.modemRepo.find({ where: { tenantId: nas.tenantId } as FindOptionsWhere<Modem> });
      const modems = tenantModems.filter(m => m.nasId === nas.id || m.nasId == null);

      // Auto-reset at the start of the local day (if enabled for this tenant).
      if (nas.tenantId != null && await this.getAutoReset(nas.tenantId)) {
        const lastReset = await this.settings.get(`modem_reset_date:${nas.id}`, '');
        if (lastReset !== today) {
          try {
            await this.resetInterfaceCounters(nas.nasname, nas.sstpUsername, nas.secret, modems.map(m => m.name));
            this.logger.log(`Auto-reset counters for NAS ${nas.id} at day start (${today})`);
          } catch (e: any) {
            this.logger.error(`Auto-reset failed for NAS ${nas.id}: ${e?.message ?? e}`);
          }
          await this.settings.set(`modem_reset_date:${nas.id}`, today);
          // Re-baseline so the reset isn't recorded as consumption.
          for (const m of modems) { m.lastTotalBytes = null; await this.modemRepo.save(m); }
          continue; // baselines re-established on the next cycle
        }
      }

      for (const m of modems) {
        const cur = byName.get(m.name);
        if (cur == null) continue;
        const prev = m.lastTotalBytes != null ? Number(m.lastTotalBytes) : null;
        m.lastTotalBytes = String(cur);
        await this.modemRepo.save(m);

        if (prev == null) continue; // first observation = baseline only
        const delta = cur >= prev ? cur - prev : cur; // reset → count current
        if (delta <= 0) continue;

        await this.dataSource.query(
          `INSERT INTO modem_daily_usage (modem_id, tenant_id, date, bytes)
           VALUES ($1, $2, $4, $3)
           ON CONFLICT (modem_id, date)
           DO UPDATE SET bytes = modem_daily_usage.bytes + $3, updated_at = NOW()`,
          [m.id, m.tenantId, delta, today],
        );
      }
    }
  }

  private toGb(bytes: number) {
    return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
  }

  /** Yearly totals for the last `years` years (optionally a single network). */
  async getYearlyReport(user: AdminUser, years: number, overrideTenantId?: number, nasId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const n = Math.min(Math.max(years || 5, 1), 20);
    const today = await this.settings.getLocalToday();
    const rows: { year: string; bytes: string }[] = await this.dataSource.query(
      `SELECT EXTRACT(YEAR FROM d.date)::int AS year, SUM(d.bytes)::bigint AS bytes
         FROM modem_daily_usage d JOIN modems m ON m.id = d.modem_id
        WHERE ($1::int IS NULL OR d.tenant_id = $1)
          AND ($3::int IS NULL OR m.nas_id = $3)
          AND d.date >= date_trunc('year', $4::date) - make_interval(years => ($2::int - 1))
        GROUP BY 1 ORDER BY 1`,
      [tenantId, n, nasId ?? null, today],
    );
    return rows.map(r => ({ year: Number(r.year), bytes: Number(r.bytes), gb: this.toGb(Number(r.bytes)) }));
  }

  /** Monthly totals for every month of a given year (optionally a single network). */
  async getMonthlyReport(user: AdminUser, year: number, overrideTenantId?: number, nasId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const y = year || new Date().getFullYear();
    const rows: { month: string; bytes: string }[] = await this.dataSource.query(
      `SELECT EXTRACT(MONTH FROM d.date)::int AS month, SUM(d.bytes)::bigint AS bytes
         FROM modem_daily_usage d JOIN modems m ON m.id = d.modem_id
        WHERE ($1::int IS NULL OR d.tenant_id = $1)
          AND ($3::int IS NULL OR m.nas_id = $3)
          AND EXTRACT(YEAR FROM d.date) = $2
        GROUP BY 1 ORDER BY 1`,
      [tenantId, y, nasId ?? null],
    );
    return rows.map(r => ({ month: Number(r.month), bytes: Number(r.bytes), gb: this.toGb(Number(r.bytes)) }));
  }

  /** Daily totals for every day of a given month (optionally a single network). */
  async getDailyReport(user: AdminUser, year: number, month: number, overrideTenantId?: number, nasId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const y = year || new Date().getFullYear();
    const m = month || new Date().getMonth() + 1;
    const rows: { day: string; bytes: string }[] = await this.dataSource.query(
      `SELECT EXTRACT(DAY FROM d.date)::int AS day, SUM(d.bytes)::bigint AS bytes
         FROM modem_daily_usage d JOIN modems m ON m.id = d.modem_id
        WHERE ($1::int IS NULL OR d.tenant_id = $1)
          AND ($4::int IS NULL OR m.nas_id = $4)
          AND EXTRACT(YEAR FROM d.date) = $2 AND EXTRACT(MONTH FROM d.date) = $3
        GROUP BY 1 ORDER BY 1`,
      [tenantId, y, m, nasId ?? null],
    );
    return rows.map(r => ({ day: Number(r.day), bytes: Number(r.bytes), gb: this.toGb(Number(r.bytes)) }));
  }

  /** Per-router breakdown for one specific day (optionally a single network). */
  async getDailyRouters(user: AdminUser, year: number, month: number, day: number, overrideTenantId?: number, nasId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const rows: { name: string; status: string; bytes: string }[] = await this.dataSource.query(
      `SELECT m.name, m.status, SUM(d.bytes)::bigint AS bytes
         FROM modem_daily_usage d JOIN modems m ON m.id = d.modem_id
        WHERE ($1::int IS NULL OR d.tenant_id = $1)
          AND ($5::int IS NULL OR m.nas_id = $5)
          AND d.date = make_date($2, $3, $4)
        GROUP BY m.name, m.status ORDER BY SUM(d.bytes) DESC`,
      [tenantId, year, month, day, nasId ?? null],
    );
    return rows.map(r => ({ name: r.name, status: r.status, bytes: Number(r.bytes), gb: this.toGb(Number(r.bytes)) }));
  }

  // ── RouterOS API (port 8728) — works with RouterOS 6 & 7 ─────

  /** Encode a word length using RouterOS variable-length encoding. */
  private rosEncodeLen(len: number): Buffer {
    if (len < 0x80)       return Buffer.from([len]);
    if (len < 0x4000)     return Buffer.from([(len >> 8) | 0x80, len & 0xff]);
    if (len < 0x200000)   return Buffer.from([(len >> 16) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
    if (len < 0x10000000) return Buffer.from([(len >> 24) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
    return Buffer.from([0xf0, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }

  /** Encode a list of words into a RouterOS sentence (ends with zero-length word). */
  private rosEncodeSentence(words: string[]): Buffer {
    const parts = words.map(w => {
      const b = Buffer.from(w, 'utf8');
      return Buffer.concat([this.rosEncodeLen(b.length), b]);
    });
    parts.push(Buffer.from([0])); // end-of-sentence
    return Buffer.concat(parts);
  }

  /** Connect to RouterOS API, login, run /ip/address/print, then disconnect. */
  async fetchMikrotikAddresses(ip: string, username: string, password: string): Promise<MikrotikAddress[]> {
    this.logger.log(`Connecting to RouterOS API on ${ip}:8728`);

    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      let buf = Buffer.alloc(0);
      let waiters: Array<() => void> = [];
      let done = false;

      const fail = (msg: string) => {
        if (done) return;
        done = true;
        sock.destroy();
        reject(new BadRequestException(msg));
      };

      sock.setTimeout(10000);
      sock.on('timeout', () => fail(`انتهت مهلة الاتصال بالمايكروتك ${ip}:8728`));
      sock.on('error', (e) => fail(`تعذّر الاتصال بـ ${ip}:8728 — ${e.message}`));

      // Accumulate incoming bytes and notify waiters.
      sock.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        const w = waiters.splice(0);
        for (const fn of w) fn();
      });

      const readBytes = (n: number): Promise<Buffer> =>
        new Promise((res, rej) => {
          const tryRead = () => {
            if (buf.length >= n) {
              const out = buf.slice(0, n);
              buf = buf.slice(n);
              res(out);
            } else {
              waiters.push(tryRead);
            }
          };
          sock.once('error', rej);
          sock.once('close', () => rej(new Error('Connection closed')));
          tryRead();
        });

      const readWord = async (): Promise<string | null> => {
        const b0 = (await readBytes(1))[0];
        let len: number;
        if ((b0 & 0x80) === 0)       { len = b0; }
        else if ((b0 & 0xc0) === 0x80) { len = ((b0 & 0x3f) << 8) | (await readBytes(1))[0]; }
        else if ((b0 & 0xe0) === 0xc0) { const b = await readBytes(2); len = ((b0 & 0x1f) << 16) | (b[0] << 8) | b[1]; }
        else if ((b0 & 0xf0) === 0xe0) { const b = await readBytes(3); len = ((b0 & 0x0f) << 24) | (b[0] << 16) | (b[1] << 8) | b[2]; }
        else                           { const b = await readBytes(4); len = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]; }
        if (len === 0) return null;
        return (await readBytes(len)).toString('utf8');
      };

      const readSentence = async (): Promise<string[]> => {
        const words: string[] = [];
        while (true) {
          const w = await readWord();
          if (w === null) break;
          words.push(w);
        }
        return words;
      };

      const parseAttrs = (words: string[]): Record<string, string> => {
        const attrs: Record<string, string> = {};
        for (let i = 1; i < words.length; i++) {
          const w = words[i];
          const eq = w.indexOf('=', 1);
          if (w.startsWith('=') && eq > 1) attrs[w.slice(1, eq)] = w.slice(eq + 1);
        }
        return attrs;
      };

      const send = (words: string[]) => sock.write(this.rosEncodeSentence(words));

      const run = async () => {
        // ── Step 1: plaintext login (works on RouterOS 6.x and 7.x) ─
        // RouterOS supports plaintext credentials directly on /login.
        // The old MD5 challenge-response method (pre-6.43) has quirks
        // on some 6.x builds; plaintext is simpler and universally supported.
        send(['/login', `=name=${username}`, `=password=${password}`]);
        const s2 = await readSentence();
        if (s2[0] === '!trap') {
          fail('بيانات الدخول للمايكروتك غير صحيحة');
          return;
        }

        // ── Step 2: fetch /interface — get all interfaces + byte stats
        send(['/interface/print', '=.proplist=name,type,running,disabled,comment,rx-byte,tx-byte']);

        const results: MikrotikAddress[] = [];
        while (true) {
          const sentence = await readSentence();
          if (!sentence.length) continue;
          const type = sentence[0];
          if (type === '!done' || type === '!fatal') break;
          if (type === '!trap') { fail('خطأ من الجهاز: ' + parseAttrs(sentence)['message']); return; }
          if (type === '!re') {
            const a = parseAttrs(sentence);
            results.push({
              address:   a['name']    ?? '',
              network:   a['type']    ?? '',
              interface: a['running'] ?? '',
              comment:   a['comment'] ?? '',
              rxByte:    parseInt(a['rx-byte'] ?? '0', 10) || 0,
              txByte:    parseInt(a['tx-byte'] ?? '0', 10) || 0,
            });
          }
        }

        done = true;
        sock.destroy();
        resolve(results);
      };

      sock.connect(8728, ip, () => run().catch(e => fail(e.message)));
    });
  }

  /** Run a per-interface RouterOS command (default: reset-counters) for each name. */
  async resetInterfaceCounters(ip: string, username: string, password: string, names: string[], command = '/interface/reset-counters'): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      let buf = Buffer.alloc(0);
      let waiters: Array<() => void> = [];
      let done = false;
      const fail = (msg: string) => { if (done) return; done = true; sock.destroy(); reject(new BadRequestException(msg)); };

      sock.setTimeout(10000);
      sock.on('timeout', () => fail(`انتهت مهلة الاتصال بالمايكروتك ${ip}:8728`));
      sock.on('error', (e) => fail(`تعذّر الاتصال بـ ${ip}:8728 — ${e.message}`));
      sock.on('data', (chunk: Buffer) => { buf = Buffer.concat([buf, chunk]); waiters.splice(0).forEach(fn => fn()); });

      const readBytes = (n: number): Promise<Buffer> => new Promise((res, rej) => {
        const tryRead = () => { if (buf.length >= n) { const out = buf.slice(0, n); buf = buf.slice(n); res(out); } else waiters.push(tryRead); };
        sock.once('error', rej); sock.once('close', () => rej(new Error('Connection closed'))); tryRead();
      });
      const readWord = async (): Promise<string | null> => {
        const b0 = (await readBytes(1))[0];
        let len: number;
        if ((b0 & 0x80) === 0) len = b0;
        else if ((b0 & 0xc0) === 0x80) len = ((b0 & 0x3f) << 8) | (await readBytes(1))[0];
        else if ((b0 & 0xe0) === 0xc0) { const b = await readBytes(2); len = ((b0 & 0x1f) << 16) | (b[0] << 8) | b[1]; }
        else if ((b0 & 0xf0) === 0xe0) { const b = await readBytes(3); len = ((b0 & 0x0f) << 24) | (b[0] << 16) | (b[1] << 8) | b[2]; }
        else { const b = await readBytes(4); len = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]; }
        if (len === 0) return null;
        return (await readBytes(len)).toString('utf8');
      };
      const readSentence = async (): Promise<string[]> => {
        const words: string[] = [];
        while (true) { const w = await readWord(); if (w === null) break; words.push(w); }
        return words;
      };
      const send = (words: string[]) => sock.write(this.rosEncodeSentence(words));

      const run = async () => {
        send(['/login', `=name=${username}`, `=password=${password}`]);
        const s = await readSentence();
        if (s[0] === '!trap') { fail('بيانات الدخول للمايكروتك غير صحيحة'); return; }

        for (const name of names) {
          send([command, `=numbers=${name}`]);
          // drain until !done / !trap for this command
          while (true) {
            const r = await readSentence();
            if (!r.length) continue;
            if (r[0] === '!done' || r[0] === '!trap' || r[0] === '!fatal') break;
          }
        }
        done = true;
        sock.destroy();
        resolve();
      };

      sock.connect(8728, ip, () => run().catch(e => fail(e.message)));
    });
  }

  /** Reset consumption for the given modems — each on its own network's MikroTik. */
  async resetCounters(modemIds: number[], user: AdminUser, overrideTenantId?: number): Promise<{ reset: number }> {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const all = await this.modemRepo.find({ where: this.w(tenantId) });
    const targets = modemIds?.length ? all.filter(m => modemIds.includes(m.id)) : all;
    if (targets.length === 0) throw new BadRequestException('لا توجد رواتر محددة');

    const nasList = await this.nasRepo.find({
      where: (tenantId ? { tenantId, type: 'router' } : { type: 'router' }) as FindOptionsWhere<Nas>,
    });
    const soleNasId = nasList.length === 1 ? nasList[0].id : null;

    // Group target interface names per network.
    const byNas = new Map<number, string[]>();
    for (const m of targets) {
      const nasId = m.nasId ?? soleNasId;
      if (nasId == null) continue;
      const arr = byNas.get(nasId) ?? [];
      arr.push(m.name);
      byNas.set(nasId, arr);
    }

    let reset = 0;
    for (const [nasId, names] of byNas) {
      const nas = nasList.find(n => n.id === nasId);
      if (!nas?.nasname || !nas.sstpUsername || !nas.secret) continue;
      await this.resetInterfaceCounters(nas.nasname, nas.sstpUsername, nas.secret, names);
      reset += names.length;
    }
    if (reset === 0) throw new BadRequestException('لا توجد شبكة Router مرتبطة');
    return { reset };
  }

  /** Enable or disable a modem's interface on its network's MikroTik. */
  async setEnabled(id: number, enabled: boolean, user: AdminUser, overrideTenantId?: number): Promise<Modem> {
    const modem = await this.findOne(id, user);
    const tenantId = getScopedTenantId(user, overrideTenantId);

    const nasList = await this.nasRepo.find({
      where: (tenantId ? { tenantId, type: 'router' } : { type: 'router' }) as FindOptionsWhere<Nas>,
    });
    const nas = nasList.find(n => n.id === modem.nasId) ?? (nasList.length === 1 ? nasList[0] : undefined);
    if (!nas?.nasname || !nas.sstpUsername || !nas.secret) {
      throw new BadRequestException('لا توجد شبكة Router مرتبطة بهذا الراوتر');
    }

    const command = enabled ? '/interface/enable' : '/interface/disable';
    await this.resetInterfaceCounters(nas.nasname, nas.sstpUsername, nas.secret, [modem.name], command);

    modem.status = enabled ? 'active' : 'disabled';
    return this.modemRepo.save(modem);
  }

  // ── Daily auto-reset toggle (per tenant) ────────────────────────

  private async getAutoReset(tenantId: number): Promise<boolean> {
    return (await this.settings.get(`modem_auto_reset:${tenantId}`, 'false')) === 'true';
  }

  async getAutoResetFor(user: AdminUser, overrideTenantId?: number): Promise<{ enabled: boolean }> {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) return { enabled: false };
    return { enabled: await this.getAutoReset(tenantId) };
  }

  async setAutoResetFor(user: AdminUser, enabled: boolean, overrideTenantId?: number): Promise<{ enabled: boolean }> {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('يجب تحديد العميل');
    await this.settings.set(`modem_auto_reset:${tenantId}`, enabled ? 'true' : 'false');
    if (enabled) {
      // Mark today's reset as already done so it only fires at the NEXT day start.
      const today = await this.settings.getLocalToday();
      const nasList = await this.nasRepo.find({ where: { tenantId, type: 'router' } as FindOptionsWhere<Nas> });
      for (const nas of nasList) await this.settings.set(`modem_reset_date:${nas.id}`, today);
    }
    return { enabled };
  }

  /** Sync modem statuses with current MikroTik interface running states.
   *  Matches by modem name = interface name, updates status for each match. */
  async syncFromMikrotik(ip: string, username: string, password: string, user: AdminUser, overrideTenantId?: number): Promise<{ updated: number }> {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const interfaces = await this.fetchMikrotikAddresses(ip, username, password);
    const ifaceMap = new Map(interfaces.map(i => [i.address, i.interface === 'true' ? 'active' : 'disabled']));

    const modems = await this.modemRepo.find({ where: this.w(tenantId) });
    let updated = 0;
    for (const modem of modems) {
      const newStatus = ifaceMap.get(modem.name);
      if (newStatus && newStatus !== modem.status) {
        modem.status = newStatus;
        await this.modemRepo.save(modem);
        updated++;
      }
    }
    return { updated };
  }

  /**
   * Live stats for the modems page (polled by the UI every 30s).
   * Finds the tenant's router NAS automatically, pulls current interface
   * running-state + byte counters, persists any status change, and returns
   * the modem list enriched with live GB usage. Falls back to plain DB rows
   * if there is no router NAS or the device is unreachable.
   */
  async getLiveStats(user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    const modems = await this.modemRepo.find({ where: this.w(tenantId), order: { name: 'ASC' } });

    // All router networks for this tenant — each modem is matched against ITS
    // own network's live interfaces (names can collide across networks).
    const nasList = await this.nasRepo.find({
      where: (tenantId ? { tenantId, type: 'router' } : { type: 'router' }) as FindOptionsWhere<Nas>,
    });

    // nasId -> Map<interfaceName, iface>
    const liveByNas = new Map<number, Map<string, MikrotikAddress>>();
    for (const nas of nasList) {
      if (!nas.nasname || !nas.sstpUsername || !nas.secret) continue;
      try {
        const live = await this.fetchMikrotikAddresses(nas.nasname, nas.sstpUsername, nas.secret);
        liveByNas.set(nas.id, new Map(live.map(i => [i.address, i])));
      } catch { /* device unreachable — leave it out */ }
    }
    // Fallback for legacy modems with no nasId: use the only network, if single.
    const soleNasId = nasList.length === 1 ? nasList[0].id : null;

    const result: any[] = [];
    for (const modem of modems) {
      const mapId = modem.nasId ?? soleNasId;
      const iface = mapId != null ? liveByNas.get(mapId)?.get(modem.name) : undefined;
      if (iface) {
        const newStatus = iface.interface === 'true' ? 'active' : 'disabled';
        if (newStatus !== modem.status) {
          modem.status = newStatus;
          await this.modemRepo.save(modem);
        }
        const bytes = (iface.rxByte ?? 0) + (iface.txByte ?? 0);
        const totalGb = Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
        result.push({ ...modem, totalGb, online: newStatus === 'active' });
      } else {
        result.push({ ...modem, totalGb: null, online: modem.status === 'active' });
      }
    }
    return result;
  }

  /** Bulk-create modems from selected MikroTik address entries. */
  async importFromMikrotik(
    entries: MikrotikAddress[],
    user: AdminUser,
    overrideTenantId?: number,
    nasId?: number,
  ): Promise<Modem[]> {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('يجب تحديد العميل قبل الاستيراد');
    const modems = entries.map((e) =>
      this.modemRepo.create({
        name:   e.address,
        model:  e.network || null,
        status: e.interface === 'true' ? 'active' : 'disabled',
        tenantId,
        nasId: nasId ?? null,
      }),
    );
    return this.modemRepo.save(modems);
  }

  private w(tenantId: number | null): FindOptionsWhere<Modem> {
    return (tenantId ? { tenantId } : {}) as FindOptionsWhere<Modem>;
  }

  findAll(user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    return this.modemRepo.find({ where: this.w(tenantId), order: { name: 'ASC' } });
  }

  async findOne(id: number, user: AdminUser) {
    const tenantId = getTenantId(user);
    const where = tenantId ? { id, tenantId } : { id };
    const modem = await this.modemRepo.findOne({ where: where as FindOptionsWhere<Modem> });
    if (!modem) throw new NotFoundException(`Modem ${id} not found`);
    return modem;
  }

  async create(dto: CreateModemDto, user: AdminUser, overrideTenantId?: number) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) {
      throw new BadRequestException('يجب تحديد العميل (tenantId) قبل إضافة موديم');
    }
    const modem = this.modemRepo.create({ ...dto, tenantId });
    return this.modemRepo.save(modem);
  }

  async update(id: number, dto: UpdateModemDto, user: AdminUser) {
    const modem = await this.findOne(id, user);
    Object.assign(modem, dto);
    return this.modemRepo.save(modem);
  }

  async remove(id: number, user: AdminUser) {
    const modem = await this.findOne(id, user);
    await this.modemRepo.remove(modem);
    return { message: `Modem '${modem.name}' deleted` };
  }
}
