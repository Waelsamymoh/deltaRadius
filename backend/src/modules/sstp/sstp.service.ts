import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);
const CMD = (cmd: string) => `/usr/local/bin/accel-cmd -p 2000 ${cmd}`;

@Injectable()
export class SstpService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminRepo: Repository<AdminUser>,
  ) {}

  // ── SSTP Accounts (read-only — credentials managed via AdminUsersService) ──

  async listSstpAccounts() {
    const users = await this.adminRepo.find({
      where: { archivedAt: IsNull() },
    });
    return users.map(u => ({
      adminId: u.id,
      adminName: u.fullName || u.email,
      sstpUsername: u.sstpUsername ?? null,
      hasPassword: !!u.sstpPassword,
    }));
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
      const ipPool = this.extractSection(content, 'ip-pool');
      const dns    = this.extractSection(content, 'dns');
      const listen = content.match(/listen\s*=\s*(.+)/)?.[1]?.trim() ?? '';
      return { ipPool, dns, listen, raw: content };
    } catch {
      return { ipPool: '', dns: '', listen: '', raw: '' };
    }
  }

  async updateConfig(data: { ipPool?: string; dns1?: string; dns2?: string }) {
    let content = fs.readFileSync('/etc/accel-ppp/accel-ppp.conf', 'utf8');

    if (data.ipPool) {
      content = content.replace(
        /\[ip-pool\][^\[]+/s,
        `[ip-pool]\ngw-ip-address=10.99.0.1\n${data.ipPool}\n\n`,
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
    await execAsync('/usr/local/bin/accel-cmd -p 2000 reload', { timeout: 5000 }).catch(() => {});
    return { message: 'تم حفظ الإعدادات وإعادة التحميل' };
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
