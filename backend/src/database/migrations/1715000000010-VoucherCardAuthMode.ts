import { MigrationInterface, QueryRunner } from 'typeorm';

export class VoucherCardAuthMode1715000000010 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE voucher_cards
        ADD COLUMN IF NOT EXISTS auth_mode VARCHAR NOT NULL DEFAULT 'both'
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE voucher_cards DROP COLUMN IF EXISTS auth_mode`);
  }
}
