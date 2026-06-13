import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubscriberPortalPassword1715000000031 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // bcrypt hash of the subscriber's self-service portal password. NULL means
    // the subscriber has no portal access yet.
    await qr.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS portal_password_hash VARCHAR(255)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE user_profiles DROP COLUMN IF EXISTS portal_password_hash`);
  }
}
