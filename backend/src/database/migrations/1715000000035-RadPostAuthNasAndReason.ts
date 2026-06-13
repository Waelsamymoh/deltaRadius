import { MigrationInterface, QueryRunner } from 'typeorm';

export class RadPostAuthNasAndReason1715000000035 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE radpostauth ADD COLUMN IF NOT EXISTS nasipaddress VARCHAR(64)`);
    await qr.query(`ALTER TABLE radpostauth ADD COLUMN IF NOT EXISTS reply_message TEXT`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE radpostauth DROP COLUMN IF EXISTS nasipaddress`);
    await qr.query(`ALTER TABLE radpostauth DROP COLUMN IF EXISTS reply_message`);
  }
}
