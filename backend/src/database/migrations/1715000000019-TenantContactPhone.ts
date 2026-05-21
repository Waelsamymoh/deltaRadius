import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a contact phone column to tenants — collected at self-registration so
 * the owner can reach the network's admin if needed.
 */
export class TenantContactPhone1715000000019 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20)`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS contact_phone`);
  }
}
