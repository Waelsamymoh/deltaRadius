import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantAuthLogAutoPurge1715000000033 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auth_log_auto_purge_enabled BOOLEAN NOT NULL DEFAULT false`);
    await qr.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auth_log_auto_purge_days INTEGER`);
    await qr.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auth_log_last_purge_at TIMESTAMP`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS auth_log_auto_purge_enabled`);
    await qr.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS auth_log_auto_purge_days`);
    await qr.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS auth_log_last_purge_at`);
  }
}
