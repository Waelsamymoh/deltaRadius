import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModeratorRole1715000000011 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'moderator'`);
    await runner.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE admin_users DROP COLUMN IF EXISTS permissions`);
  }
}
