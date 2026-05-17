import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminUsers1715000000001 implements MigrationInterface {
  name = 'AdminUsers1715000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE admin_role AS ENUM ('superadmin', 'admin')
    `);

    await queryRunner.query(`
      CREATE TABLE admin_users (
        id            SERIAL PRIMARY KEY,
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name     VARCHAR(255),
        role          admin_role NOT NULL DEFAULT 'admin',
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        tenant_id     INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_admin_users_tenant ON admin_users (tenant_id)`);
    await queryRunner.query(`CREATE INDEX idx_admin_users_email  ON admin_users (email)`);

    await queryRunner.query(`ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY`);

    // superadmins (tenant_id IS NULL) can see all; admins see only their tenant
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON admin_users
        FOR ALL USING (
          tenant_id IS NULL
          OR tenant_id = current_setting('app.current_tenant_id', true)::INTEGER
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON admin_users`);
    await queryRunner.query(`DROP TABLE IF EXISTS admin_users`);
    await queryRunner.query(`DROP TYPE IF EXISTS admin_role`);
  }
}
