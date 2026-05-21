import { MigrationInterface, QueryRunner } from 'typeorm';

export class MissingTables1715000000013 implements MigrationInterface {
  name = 'MissingTables1715000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // SSTP columns missing from admin_users entity
    await queryRunner.query(`
      ALTER TABLE admin_users
        ADD COLUMN IF NOT EXISTS sstp_username VARCHAR UNIQUE,
        ADD COLUMN IF NOT EXISTS sstp_password VARCHAR
    `);

    // user_data_usage table (used by QuotaEnforcerService)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_data_usage (
        id                      SERIAL PRIMARY KEY,
        username                VARCHAR NOT NULL,
        tenant_id               INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        total_download_bytes    BIGINT NOT NULL DEFAULT 0,
        total_upload_bytes      BIGINT NOT NULL DEFAULT 0,
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        quota_reset_at          TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01',
        quota_reset_radacct_id  BIGINT NOT NULL DEFAULT 0
      )
    `);
    // Functional unique index to handle NULL tenant_id (mirrors the ON CONFLICT clause)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_usage_username_tenant
        ON user_data_usage (username, COALESCE(tenant_id, -1))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_data_usage`);
    await queryRunner.query(`ALTER TABLE admin_users DROP COLUMN IF EXISTS sstp_username`);
    await queryRunner.query(`ALTER TABLE admin_users DROP COLUMN IF EXISTS sstp_password`);
  }
}
