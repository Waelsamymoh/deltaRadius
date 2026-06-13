import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforce that every tenant's contact phone is unique across the platform.
 * A partial unique index lets multiple legacy NULL rows coexist.
 */
export class TenantPhoneUnique1715000000020 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS tenants_contact_phone_unique
         ON tenants (contact_phone)
         WHERE contact_phone IS NOT NULL`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS tenants_contact_phone_unique`);
  }
}
