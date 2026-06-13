import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantAssistantRole1715000000024 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ADD VALUE must run outside a transaction for older Postgres versions,
    // but recent versions allow it inside. IF NOT EXISTS makes this idempotent.
    await qr.query(`ALTER TYPE "admin_role" ADD VALUE IF NOT EXISTS 'tenant_assistant'`);
  }

  async down(): Promise<void> {
    // PostgreSQL does not support removing enum values — no-op.
  }
}
