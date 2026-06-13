import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserProfileGroupName1715000000032 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS group_name VARCHAR(100)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE user_profiles DROP COLUMN IF EXISTS group_name`);
  }
}
