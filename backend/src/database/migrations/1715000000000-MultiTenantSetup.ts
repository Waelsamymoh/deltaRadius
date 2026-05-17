import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiTenantSetup1715000000000 implements MigrationInterface {
  name = 'MultiTenantSetup1715000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Tenants table ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenants" (
        "id"          SERIAL PRIMARY KEY,
        "name"        VARCHAR(255) NOT NULL UNIQUE,
        "realm"       VARCHAR(255) UNIQUE,
        "description" TEXT,
        "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Add tenant_id to every RADIUS table ───────────────────────────
    const tables = [
      'nas', 'radcheck', 'radreply', 'radgroupcheck',
      'radgroupreply', 'radusergroup', 'radpostauth', 'radacct',
    ];

    for (const table of tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS tenant_id INTEGER
          REFERENCES tenants(id)
          ON DELETE ${['radpostauth', 'radacct'].includes(table) ? 'SET NULL' : 'CASCADE'}
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_${table}_tenant"
          ON "${table}" (tenant_id)
      `);
    }

    // ── Enable Row Level Security ──────────────────────────────────────
    for (const table of ['tenants', ...tables]) {
      await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }

    // ── RLS policies (scoped to app.current_tenant_id per-request) ────
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON tenants
        FOR ALL USING (id = current_setting('app.current_tenant_id', true)::INTEGER)
    `);

    for (const table of tables) {
      await queryRunner.query(`
        CREATE POLICY tenant_isolation ON "${table}"
          FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER)
      `);
    }

    // NOTE: ALTER USER radius BYPASSRLS and CREATE USER radius_app
    // require superuser and were run separately via postgres role.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'nas', 'radcheck', 'radreply', 'radgroupcheck',
      'radgroupreply', 'radusergroup', 'radpostauth', 'radacct',
    ];

    for (const table of ['tenants', ...tables]) {
      await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON "${table}"`);
      await queryRunner.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
    }

    for (const table of tables) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_${table}_tenant"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS tenant_id`);
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
  }
}
