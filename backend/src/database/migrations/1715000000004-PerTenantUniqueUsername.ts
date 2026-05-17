import { MigrationInterface, QueryRunner } from 'typeorm';

export class PerTenantUniqueUsername1715000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop global unique constraint on username
    await queryRunner.query(`ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS "user_profiles_username_key"`);
    // Add per-tenant unique constraint (same username allowed in different tenants)
    await queryRunner.query(`ALTER TABLE user_profiles ADD CONSTRAINT "user_profiles_username_tenant_key" UNIQUE (username, tenant_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS "user_profiles_username_tenant_key"`);
    await queryRunner.query(`ALTER TABLE user_profiles ADD CONSTRAINT "user_profiles_username_key" UNIQUE (username)`);
  }
}
