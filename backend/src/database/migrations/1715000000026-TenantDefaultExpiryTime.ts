import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantDefaultExpiryTime1715000000026 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_expiry_time VARCHAR(5) NOT NULL DEFAULT '12:00'`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS default_expiry_time`);
  }
}
