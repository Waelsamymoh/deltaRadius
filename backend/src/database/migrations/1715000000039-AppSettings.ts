import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive only: a global key/value settings table. Seeds the system timezone. */
export class AppSettings1715000000039 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key        VARCHAR(64) PRIMARY KEY,
        value      TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(
      `INSERT INTO app_settings (key, value) VALUES ('timezone', 'Africa/Cairo')
       ON CONFLICT (key) DO NOTHING`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS app_settings`);
  }
}
