import { MigrationInterface, QueryRunner } from 'typeorm';

export class VoucherCards1715000000007 implements MigrationInterface {
  async up(qr: QueryRunner) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS voucher_cards (
        id              SERIAL PRIMARY KEY,
        code            VARCHAR(50)  NOT NULL UNIQUE,
        plan_id         INTEGER      NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
        tenant_id       INTEGER      REFERENCES tenants(id) ON DELETE CASCADE,
        batch_name      VARCHAR(100),
        status          VARCHAR(20)  NOT NULL DEFAULT 'unused',
        duration_days   INTEGER      NOT NULL,
        start_mode      VARCHAR(20)  NOT NULL DEFAULT 'first_use',
        expires_at      TIMESTAMP,
        activated_at    TIMESTAMP,
        created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
        note            VARCHAR(255)
      );
      CREATE INDEX IF NOT EXISTS idx_voucher_cards_tenant ON voucher_cards(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_voucher_cards_status ON voucher_cards(status);
      CREATE INDEX IF NOT EXISTS idx_voucher_cards_batch  ON voucher_cards(batch_name);
    `);
  }

  async down(qr: QueryRunner) {
    await qr.query(`DROP TABLE IF EXISTS voucher_cards;`);
  }
}
