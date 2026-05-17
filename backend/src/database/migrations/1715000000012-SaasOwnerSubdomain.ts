import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaasOwnerSubdomain1715000000012 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // 1. Add owner role to enum
    await runner.query(`ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'owner'`);

    // 2. Migrate existing superadmin users with no tenantId → owner
    //    (commit enum change first — PostgreSQL requires it before use in DML)
    await runner.query(`COMMIT`);
    await runner.query(`
      UPDATE admin_users SET role = 'owner'
      WHERE role = 'superadmin' AND tenant_id IS NULL
    `);

    // 3. Add subdomain + business_name to tenants
    await runner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subdomain VARCHAR UNIQUE`);
    await runner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_name VARCHAR`);

    // 4. Ensure radacct has tenant_id (safety — already exists but guard)
    await runner.query(`
      ALTER TABLE radacct ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL
    `);

    // 5. Index for tenant-scoped accounting lookups
    await runner.query(`CREATE INDEX IF NOT EXISTS idx_radacct_tenant ON radacct(tenant_id)`);
    await runner.query(`CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain)`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS idx_radacct_tenant`);
    await runner.query(`DROP INDEX IF EXISTS idx_tenants_subdomain`);
    await runner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS subdomain`);
    await runner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS business_name`);
  }
}
