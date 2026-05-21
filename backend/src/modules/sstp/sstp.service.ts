import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, Repository } from 'typeorm';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { Tenant } from '../../database/entities/tenant.entity';

const execAsync = promisify(exec);
const CMD = (cmd: string) => `/usr/local/bin/accel-cmd -p 2000 ${cmd}`;
const CHAP_SECRETS = '/etc/ppp/chap-secrets';

export interface SstpUser {
  username: string;
  server: string;
  ip: string;
  source: 'tenant' | 'standalone';
  tenantId?: number;
  tenantName?: string;
}

@Injectable()
export class SstpService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  // ── chap-secrets CRUD ──────────────────────────────────────────────────────

  private readChap(): string {
    try { return fs.readFileSync(CHAP_SECRETS, 'utf8'); }
    catch { return ''; }
  }

  private writeChap(content: string): void {
    fs.writeFileSync(CHAP_SECRETS, content, { mode: 0o640 });
    // tell accel-ppp to reload the file so static IPs apply to new connections
    execAsync('/usr/local/bin/accel-cmd -p 2000 reload', { timeout: 3000 }).catch(() => {});
  }

  private parseChap(content: string): Array<{ username: string; server: string; password: string; ip: string }> {
    return content
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => {
        const parts = l.split(/\s+/);
        return {
          username: parts[0] ?? '',
          server:   parts[1] ?? '*',
          password: parts[2] ?? '',
          ip:       parts[3] ?? '*',
        };
      })
      .filter(u => u.username);
  }

  private serializeChap(users: Array<{ username: string; server: string; password: string; ip: string }>): string {
    const header = '# SSTP / PPP chap-secrets — managed by DeltaRadius\n';
    const rows = users.map(u => `${u.username}\t${u.server}\t${u.password}\t${u.ip}`).join('\n');
    return header + rows + (rows ? '\n' : '');
  }

  async listUsers(): Promise<SstpUser[]> {
    // 1. Get all tenants that have SSTP credentials
    const tenants = await this.tenantRepo.find({
      where: { sstpUsername: Not(IsNull()), sstpPassword: Not(IsNull()) },
    });

    // 2. Read current chap-secrets
    let chap = this.parseChap(this.readChap());

    // 3. Auto-sync: ensure every tenant with SSTP credentials exists in chap-secrets
    let dirty = false;
    for (const t of tenants) {
      if (!t.sstpUsername || !t.sstpPassword) continue;
      const existing = chap.find(u => u.username === t.sstpUsername);
      if (!existing) {
        chap.push({ username: t.sstpUsername, server: '*', password: t.sstpPassword, ip: '*' });
        dirty = true;
      } else if (existing.password !== t.sstpPassword) {
        existing.password = t.sstpPassword;
        dirty = true;
      }
    }
    if (dirty) this.writeChap(this.serializeChap(chap));

    // 4. Build response — label entries that match a tenant
    const tenantByUsername = new Map(
      tenants.filter(t => t.sstpUsername).map(t => [t.sstpUsername!, t]),
    );

    return chap.map(({ username, server, ip }) => {
      const t = tenantByUsername.get(username);
      if (t) {
        return {
          username, server, ip,
          source: 'tenant' as const,
          tenantId: t.id,
          tenantName: t.businessName || t.name,
        };
      }
      return { username, server, ip, source: 'standalone' as const };
    });
  }

  createUser(username: string, password: string, ip = '*') {
    if (!username || !password) throw new BadRequestException('اسم المستخدم وكلمة المرور مطلوبان');
    username = username.trim();
    if (/\s/.test(username)) throw new BadRequestException('اسم المستخدم لا يجب أن يحتوي على مسافات');

    const content = this.readChap();
    const users = this.parseChap(content);
    if (users.find(u => u.username === username))
      throw new BadRequestException('اسم المستخدم موجود بالفعل');

    users.push({ username, server: '*', password, ip });
    this.writeChap(this.serializeChap(users));
    return { message: `تم إضافة المستخدم ${username}` };
  }

  updateUser(username: string, newPassword: string) {
    if (!newPassword) throw new BadRequestException('كلمة المرور مطلوبة');
    const content = this.readChap();
    const users = this.parseChap(content);
    const user = users.find(u => u.username === username);
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    user.password = newPassword;
    this.writeChap(this.serializeChap(users));
    return { message: `تم تحديث كلمة مرور ${username}` };
  }

  deleteUser(username: string) {
    const content = this.readChap();
    const users = this.parseChap(content);
    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) throw new NotFoundException('المستخدم غير موجود');
    users.splice(idx, 1);
    this.writeChap(this.serializeChap(users));
    return { message: `تم حذف المستخدم ${username}` };
  }

  private async run(cmd: string): Promise<string> {
    try {
      const { stdout } = await execAsync(CMD(cmd), { timeout: 5000 });
      return stdout.trim();
    } catch {
      throw new Error('accel-ppp غير متاح حالياً');
    }
  }

  async getStat() {
    const raw = await this.run('show stat');
    const stat: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([\w\s()\/]+?):\s*(.+)$/);
      if (m) stat[m[1].trim()] = m[2].trim();
    }

    const sessions = this.parseNum(stat['active']);
    const starting = this.parseNum(stat['starting']);
    const cpu = stat['cpu'] ?? '0%';
    const mem = stat['mem(rss/virt)']?.split('/')[0] ?? '0';
    const uptime = stat['uptime'] ?? '—';

    const sstpActive = this.parseNum(
      raw.match(/sstp:[\s\S]*?active:\s*(\d+)/)?.[1] ?? '0',
    );
    const radiusState = raw.includes('state: active') ? 'متصل' : 'منقطع';

    return { sessions, starting, sstpActive, cpu, memKb: Number(mem), uptime, radiusState };
  }

  async getSessions() {
    const raw = await this.run(
      'show sessions ifname,username,ip,state,uptime,rx-bytes,tx-bytes',
    );
    const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('-'));
    if (lines.length < 2) return [];

    const rows: any[] = [];
    for (const line of lines.slice(1)) {
      const cols = line.split('|').map(c => c.trim());
      if (cols.length < 7 || !cols[1]) continue;
      rows.push({
        ifname:   cols[0],
        username: cols[1],
        ip:       cols[2],
        state:    cols[3],
        uptime:   cols[4],
        rxBytes:  this.parseBytes(cols[5]),
        txBytes:  this.parseBytes(cols[6]),
      });
    }
    return rows;
  }

  async terminateSession(username: string) {
    await this.run(`terminate match username ${username} soft`);
    return { message: `تم قطع اتصال ${username}` };
  }

  async getConfig() {
    try {
      const content = fs.readFileSync('/etc/accel-ppp/accel-ppp.conf', 'utf8');
      const ipPoolSection = this.extractSection(content, 'ip-pool');
      const dns = this.extractSection(content, 'dns');
      const lines = ipPoolSection.split('\n').filter(l => l.trim());
      const gwLine = lines.find(l => l.startsWith('gw-ip-address='));
      const poolLines = lines.filter(l => !l.startsWith('gw-ip-address='));
      return {
        ipPool: ipPoolSection,
        gwIp:   gwLine?.split('=')?.[1]?.trim() ?? '10.100.0.1',
        pool:   poolLines.join('\n'),
        dns,
        bind:   content.match(/bind\s*=\s*(.+)/)?.[1]?.trim() ?? '',
        port:   content.match(/^port\s*=\s*(.+)/m)?.[1]?.trim() ?? '4430',
      };
    } catch {
      return { ipPool: '', gwIp: '10.100.0.1', pool: '', dns: '', bind: '', port: '4430' };
    }
  }

  async updateConfig(data: { ipPool?: string; dns1?: string; dns2?: string; gwIp?: string }) {
    let content = fs.readFileSync('/etc/accel-ppp/accel-ppp.conf', 'utf8');

    if (data.ipPool) {
      const gw = data.gwIp ?? '10.100.0.1';
      content = content.replace(
        /\[ip-pool\][^\[]+/s,
        `[ip-pool]\ngw-ip-address=${gw}\n${data.ipPool}\n\n`,
      );
    }
    if (data.dns1 || data.dns2) {
      const dns1 = data.dns1 ?? '8.8.8.8';
      const dns2 = data.dns2 ?? '8.8.4.4';
      content = content.replace(
        /\[dns\][^\[]+/s,
        `[dns]\ndns1=${dns1}\ndns2=${dns2}\n\n`,
      );
    }

    fs.writeFileSync('/etc/accel-ppp/accel-ppp.conf', content);
    // ip-pool is loaded only at startup — requires full restart (not just reload)
    await execAsync('systemctl restart accel-ppp', { timeout: 15000 }).catch(() => {});
    return { message: 'تم حفظ الإعدادات وإعادة تشغيل السيرفر' };
  }

  async getStatus() {
    try {
      await this.run('show version');
      return { running: true };
    } catch {
      return { running: false };
    }
  }

  async restart() {
    await execAsync('systemctl restart accel-ppp', { timeout: 10000 }).catch(() => {});
    return { message: 'جاري إعادة تشغيل السيرفر...' };
  }

  async getCert() {
    const { stdout } = await execAsync(
      'openssl x509 -in /etc/accel-ppp/ssl/server.crt -noout -text 2>&1',
    ).catch(() => ({ stdout: '' }));
    const expiry  = stdout.match(/Not After\s*:\s*(.+)/)?.[1]?.trim() ?? '—';
    const subject = stdout.match(/Subject:\s*(.+)/)?.[1]?.trim() ?? '—';
    return { expiry, subject };
  }

  private extractSection(content: string, section: string): string {
    const m = content.match(new RegExp(`\\[${section}\\]([^\\[]+)`, 's'));
    return m ? m[1].trim() : '';
  }

  private parseNum(v: string | undefined): number {
    return parseInt(v ?? '0', 10) || 0;
  }

  private parseBytes(v: string): number {
    if (!v) return 0;
    const n = parseFloat(v);
    if (v.includes('G')) return Math.round(n * 1024 ** 3);
    if (v.includes('M')) return Math.round(n * 1024 ** 2);
    if (v.includes('K')) return Math.round(n * 1024);
    return Math.round(n);
  }
}
