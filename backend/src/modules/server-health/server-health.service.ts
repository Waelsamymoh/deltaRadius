import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

export interface ServerHealth {
  hostname: string;
  os: { platform: string; release: string; arch: string };
  uptimeSec: number;
  loadavg: { '1m': number; '5m': number; '15m': number };
  cpu: {
    cores: number;
    model: string;
    usagePct: number;       // overall, 0–100
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePct: number;       // 0–100
  };
  disk: {
    mount: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePct: number;       // 0–100
  } | null;
  services: {
    freeradius: 'active' | 'inactive' | 'unknown';
    accelPpp:   'active' | 'inactive' | 'unknown';
    postgres:   'active' | 'inactive' | 'unknown';
  };
}

@Injectable()
export class ServerHealthService {

  /** Read /proc/stat once and return the aggregate CPU counters. */
  private async readCpuStat(): Promise<{ idle: number; total: number }> {
    const txt = await fs.readFile('/proc/stat', 'utf8');
    const line = txt.split('\n')[0]; // "cpu  user nice system idle iowait irq softirq steal guest"
    const parts = line.trim().split(/\s+/).slice(1).map(n => parseInt(n, 10) || 0);
    const idle  = parts[3] + (parts[4] || 0); // idle + iowait
    const total = parts.reduce((a, b) => a + b, 0);
    return { idle, total };
  }

  /** CPU % by sampling /proc/stat twice with a short delay. */
  private async cpuUsagePct(): Promise<number> {
    try {
      const a = await this.readCpuStat();
      await new Promise(r => setTimeout(r, 150));
      const b = await this.readCpuStat();
      const idleDelta  = b.idle  - a.idle;
      const totalDelta = b.total - a.total;
      if (totalDelta <= 0) return 0;
      return Math.max(0, Math.min(100, 100 * (1 - idleDelta / totalDelta)));
    } catch {
      return 0;
    }
  }

  /** Root-partition disk usage via `df -k /`. */
  private async diskUsage(): Promise<ServerHealth['disk']> {
    try {
      const { stdout } = await execAsync('df -k /', { timeout: 3000 });
      // Lines: "Filesystem 1K-blocks Used Available Use% Mounted on"
      //        "/dev/...   123456    45  78900     1%   /"
      const row = stdout.trim().split('\n')[1];
      if (!row) return null;
      const cols = row.split(/\s+/);
      const totalKb = parseInt(cols[1], 10);
      const usedKb  = parseInt(cols[2], 10);
      const freeKb  = parseInt(cols[3], 10);
      const mount   = cols[5] ?? '/';
      const totalBytes = totalKb * 1024;
      const usedBytes  = usedKb  * 1024;
      const freeBytes  = freeKb  * 1024;
      return {
        mount,
        totalBytes,
        usedBytes,
        freeBytes,
        usagePct: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
      };
    } catch {
      return null;
    }
  }

  private async serviceStatus(name: string): Promise<'active' | 'inactive' | 'unknown'> {
    try {
      const { stdout } = await execAsync(`systemctl is-active ${name}`, { timeout: 2000 });
      return stdout.trim() === 'active' ? 'active' : 'inactive';
    } catch (e: any) {
      // is-active exits 3 for inactive — promisified exec rejects on non-zero
      const out = (e?.stdout ?? '').trim();
      if (out === 'inactive' || out === 'failed') return 'inactive';
      return 'unknown';
    }
  }

  async getHealth(): Promise<ServerHealth> {
    const [cpuPct, disk, freeradius, accelPpp, postgres] = await Promise.all([
      this.cpuUsagePct(),
      this.diskUsage(),
      this.serviceStatus('freeradius'),
      this.serviceStatus('accel-ppp'),
      this.serviceStatus('postgresql'),
    ]);

    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    const load     = os.loadavg();
    const cpus     = os.cpus();

    return {
      hostname: os.hostname(),
      os: {
        platform: os.platform(),
        release:  os.release(),
        arch:     os.arch(),
      },
      uptimeSec: Math.floor(os.uptime()),
      loadavg: { '1m': load[0], '5m': load[1], '15m': load[2] },
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model?.trim() ?? 'unknown',
        usagePct: Number(cpuPct.toFixed(1)),
      },
      memory: {
        totalBytes: totalMem,
        usedBytes:  usedMem,
        freeBytes:  freeMem,
        usagePct:   Number(((usedMem / totalMem) * 100).toFixed(1)),
      },
      disk: disk ? { ...disk, usagePct: Number(disk.usagePct.toFixed(1)) } : null,
      services: { freeradius, accelPpp, postgres },
    };
  }
}
