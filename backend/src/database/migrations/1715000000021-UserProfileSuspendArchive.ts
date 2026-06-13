import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add suspension + archive flags to subscribers. Both flags block RADIUS auth
 * via the existing radcheck-stripping logic but only `is_archived` hides the
 * subscriber from the default list view.
 */
export class UserProfileSuspendArchive1715000000021 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false`);
    await runner.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN NOT NULL DEFAULT false`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE user_profiles DROP COLUMN IF EXISTS is_archived`);
    await runner.query(`ALTER TABLE user_profiles DROP COLUMN IF EXISTS is_suspended`);
  }
}
