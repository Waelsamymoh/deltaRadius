import { MigrationInterface, QueryRunner } from 'typeorm';

export class OriginalPlanId1715000000008 implements MigrationInterface {
  async up(qr: QueryRunner) {
    await qr.query(`
      ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS original_plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL;
    `);
  }
  async down(qr: QueryRunner) {
    await qr.query(`ALTER TABLE user_profiles DROP COLUMN IF EXISTS original_plan_id;`);
  }
}
