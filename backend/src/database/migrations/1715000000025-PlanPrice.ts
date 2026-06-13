import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanPrice1715000000025 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS price NUMERIC(10,2)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE plans DROP COLUMN IF EXISTS price`);
  }
}
