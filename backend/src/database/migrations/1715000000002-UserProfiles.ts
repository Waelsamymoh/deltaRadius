import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserProfiles1715000000002 implements MigrationInterface {
  name = 'UserProfiles1715000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_profiles" (
        "id"            SERIAL PRIMARY KEY,
        "username"      VARCHAR(64)  NOT NULL UNIQUE,
        "tenant_id"     INTEGER      REFERENCES tenants(id) ON DELETE CASCADE,
        "plan_id"       INTEGER      REFERENCES plans(id)   ON DELETE SET NULL,
        "first_name"    VARCHAR(100) NOT NULL DEFAULT '',
        "address"       TEXT,
        "mobile"        VARCHAR(20),
        "notes"         TEXT,
        "start_date"    DATE         NOT NULL DEFAULT CURRENT_DATE,
        "duration_days" INTEGER      NOT NULL DEFAULT 30,
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_profiles_username"
        ON "user_profiles" (username)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_profiles_tenant"
        ON "user_profiles" (tenant_id)
    `);

    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON "user_profiles" TO radius_app
    `);
    await queryRunner.query(`
      GRANT USAGE, SELECT ON SEQUENCE user_profiles_id_seq TO radius_app
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_profiles"`);
  }
}
