import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantSstpCredentials1715000000014 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS sstp_username VARCHAR(100) UNIQUE,
        ADD COLUMN IF NOT EXISTS sstp_password VARCHAR(255)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE tenants
        DROP COLUMN IF EXISTS sstp_username,
        DROP COLUMN IF EXISTS sstp_password
    `);
  }
}
