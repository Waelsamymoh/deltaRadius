import { MigrationInterface, QueryRunner } from 'typeorm';

export class NasSstpUsername1715000000016 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE nas ADD COLUMN IF NOT EXISTS sstp_username VARCHAR(100)`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE nas DROP COLUMN IF EXISTS sstp_username`);
  }
}
