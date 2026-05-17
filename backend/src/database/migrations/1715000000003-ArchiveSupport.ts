import { MigrationInterface, QueryRunner } from 'typeorm';

export class ArchiveSupport1715000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL`);
    await queryRunner.query(`ALTER TABLE tenants     ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE admin_users DROP COLUMN IF EXISTS archived_at`);
    await queryRunner.query(`ALTER TABLE tenants     DROP COLUMN IF EXISTS is_archived`);
  }
}
