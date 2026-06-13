import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const DEFAULT_TZ = 'Africa/Cairo';

export type TimeConfig = {
  mode: 'auto' | 'manual';
  timezone: string;       // used when mode = 'auto'
  offsetMinutes: number;  // used when mode = 'manual' (offset from real UTC)
};

@Injectable()
export class SettingsService {
  private cache = new Map<string, string>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async get(key: string, fallback: string): Promise<string> {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const rows: { value: string }[] = await this.dataSource.query(
      `SELECT value FROM app_settings WHERE key = $1`,
      [key],
    );
    const value = rows[0]?.value ?? fallback;
    this.cache.set(key, value);
    return value;
  }

  async set(key: string, value: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value],
    );
    this.cache.set(key, value);
  }

  // ── Time configuration ──────────────────────────────────────

  async getTimeConfig(): Promise<TimeConfig> {
    const mode = (await this.get('time_mode', 'auto')) as 'auto' | 'manual';
    const timezone = await this.get('timezone', DEFAULT_TZ);
    const offsetMinutes = parseInt(await this.get('time_offset_minutes', '0'), 10) || 0;
    return { mode: mode === 'manual' ? 'manual' : 'auto', timezone, offsetMinutes };
  }

  /** The current system wall-clock "now" as a JS Date-ish ISO string + the date. */
  async getSystemNow(): Promise<{ now: string; today: string; config: TimeConfig }> {
    const config = await this.getTimeConfig();
    const sql =
      config.mode === 'manual'
        ? `SELECT (NOW() AT TIME ZONE 'UTC' + make_interval(mins => $1))::timestamp AS now,
                  to_char((NOW() AT TIME ZONE 'UTC' + make_interval(mins => $1))::date, 'YYYY-MM-DD') AS today`
        : `SELECT (NOW() AT TIME ZONE $1)::timestamp AS now,
                  to_char((NOW() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS today`;
    const param = config.mode === 'manual' ? config.offsetMinutes : config.timezone;
    const r = await this.dataSource.query(sql, [param]);
    return { now: r[0].now, today: r[0].today, config };
  }

  /** Today's date (YYYY-MM-DD) in the configured system time. */
  async getLocalToday(): Promise<string> {
    return (await this.getSystemNow()).today;
  }

  // Back-compat helper.
  getTimezone(): Promise<string> {
    return this.get('timezone', DEFAULT_TZ);
  }

  /**
   * Update the time configuration.
   *  - auto:   provide `timezone` (IANA name)
   *  - manual: provide `datetime` (the wall-clock the operator wants "now" to be);
   *            we store the offset from real UTC so the clock keeps ticking.
   */
  async setTimeConfig(input: { mode: 'auto' | 'manual'; timezone?: string; datetime?: string }): Promise<TimeConfig> {
    if (input.mode === 'manual') {
      if (!input.datetime) throw new BadRequestException('أدخل التاريخ والوقت');
      // Treat the supplied wall-clock as UTC, derive the offset from real UTC now.
      const enteredMs = Date.parse(input.datetime.endsWith('Z') ? input.datetime : input.datetime + 'Z');
      if (Number.isNaN(enteredMs)) throw new BadRequestException('صيغة التاريخ غير صالحة');
      const offsetMinutes = Math.round((enteredMs - Date.now()) / 60000);
      await this.set('time_mode', 'manual');
      await this.set('time_offset_minutes', String(offsetMinutes));
    } else {
      const tz = input.timezone || DEFAULT_TZ;
      try {
        Intl.DateTimeFormat('en-US', { timeZone: tz });
      } catch {
        throw new BadRequestException(`منطقة زمنية غير صالحة: ${tz}`);
      }
      await this.set('time_mode', 'auto');
      await this.set('timezone', tz);
    }
    return this.getTimeConfig();
  }

  async setTimezone(tz: string): Promise<{ timezone: string }> {
    await this.setTimeConfig({ mode: 'auto', timezone: tz });
    return { timezone: tz };
  }
}
