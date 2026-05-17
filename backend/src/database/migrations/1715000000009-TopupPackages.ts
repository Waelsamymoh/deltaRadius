import { MigrationInterface, QueryRunner } from 'typeorm';

export class TopupPackages1715000000009 implements MigrationInterface {
  async up(qr: QueryRunner) {
    // Predefined topup packages (admin-managed)
    await qr.query(`
      CREATE TABLE IF NOT EXISTS topup_packages (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        size_gb     NUMERIC(10,2) NOT NULL CHECK (size_gb > 0),
        price       NUMERIC(10,2) NOT NULL DEFAULT 0,
        description VARCHAR(255),
        tenant_id   INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_topup_packages_tenant ON topup_packages(tenant_id);
    `);

    // History of topups applied to users
    await qr.query(`
      CREATE TABLE IF NOT EXISTS user_topups (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(100) NOT NULL,
        tenant_id  INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        package_id INTEGER REFERENCES topup_packages(id) ON DELETE SET NULL,
        size_gb    NUMERIC(10,2) NOT NULL,
        price      NUMERIC(10,2) NOT NULL DEFAULT 0,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
        applied_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_topups_username  ON user_topups(username);
      CREATE INDEX IF NOT EXISTS idx_user_topups_tenant    ON user_topups(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_user_topups_applied   ON user_topups(applied_at);
    `);

    // Bonus pool on user_profiles — carry-over remaining bonus bytes
    await qr.query(`
      ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS bonus_remaining_bytes BIGINT NOT NULL DEFAULT 0;
    `);
  }

  async down(qr: QueryRunner) {
    await qr.query(`ALTER TABLE user_profiles DROP COLUMN IF EXISTS bonus_remaining_bytes;`);
    await qr.query(`DROP TABLE IF EXISTS user_topups;`);
    await qr.query(`DROP TABLE IF EXISTS topup_packages;`);
  }
}
