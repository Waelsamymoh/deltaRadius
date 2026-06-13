import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive only: per-modem daily consumption tracking.
 *  - adds modems.last_total_bytes (last observed cumulative counter)
 *  - creates modem_daily_usage (one row per modem per day) */
export class ModemDailyUsage1715000000037 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE modems ADD COLUMN IF NOT EXISTS last_total_bytes BIGINT`);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS modem_daily_usage (
        id         SERIAL PRIMARY KEY,
        modem_id   INTEGER NOT NULL REFERENCES modems(id) ON DELETE CASCADE,
        tenant_id  INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        date       DATE NOT NULL,
        bytes      BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (modem_id, date)
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS modem_daily_tenant_date_idx ON modem_daily_usage (tenant_id, date)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS modem_daily_usage`);
    await qr.query(`ALTER TABLE modems DROP COLUMN IF EXISTS last_total_bytes`);
  }
}
