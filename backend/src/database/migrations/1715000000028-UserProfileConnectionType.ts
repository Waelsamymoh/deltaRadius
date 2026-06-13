import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserProfileConnectionType1715000000028 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS connection_type VARCHAR(20) NOT NULL DEFAULT 'hotspot'`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE user_profiles DROP COLUMN IF EXISTS connection_type`);
  }
}
