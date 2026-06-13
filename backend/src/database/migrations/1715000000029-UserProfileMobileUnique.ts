import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserProfileMobileUnique1715000000029 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // Partial unique index — enforces "no two subscribers share a mobile"
    // across the ENTIRE project, while tolerating legacy rows that have a
    // NULL/empty mobile. New rows go through the API which now requires mobile.
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_mobile_unique
        ON user_profiles (mobile)
        WHERE mobile IS NOT NULL AND mobile <> ''
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS user_profiles_mobile_unique`);
  }
}
