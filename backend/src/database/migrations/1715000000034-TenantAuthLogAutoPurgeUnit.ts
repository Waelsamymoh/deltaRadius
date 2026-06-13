import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantAuthLogAutoPurgeUnit1715000000034 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auth_log_auto_purge_unit VARCHAR(8) NOT NULL DEFAULT 'days'`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS auth_log_auto_purge_unit`);
  }
}
