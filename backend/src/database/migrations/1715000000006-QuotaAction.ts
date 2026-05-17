import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuotaAction1715000000006 implements MigrationInterface {
  async up(qr: QueryRunner) {
    await qr.query(`
      ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS quota_action  VARCHAR(20) NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS fallback_plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL;
    `);
  }
  async down(qr: QueryRunner) {
    await qr.query(`
      ALTER TABLE plans
        DROP COLUMN IF EXISTS quota_action,
        DROP COLUMN IF EXISTS fallback_plan_id;
    `);
  }
}
