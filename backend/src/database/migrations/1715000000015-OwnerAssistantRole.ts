import { MigrationInterface, QueryRunner } from 'typeorm';

export class OwnerAssistantRole1715000000015 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'owner_assistant'`);
  }

  async down(_runner: QueryRunner): Promise<void> {
    // No-op: Postgres has no clean way to remove an enum value.
  }
}
