import { MigrationInterface, QueryRunner } from 'typeorm';

export class SalesReceipts1715000000027 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS sales_receipts (
        id              SERIAL PRIMARY KEY,
        tenant_id       INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        admin_id        INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
        admin_email     VARCHAR(255),
        admin_name      VARCHAR(255),
        username        VARCHAR(64) NOT NULL,
        subscriber_name VARCHAR(255),
        plan_id         INTEGER,
        plan_name       VARCHAR(255),
        price           NUMERIC(10,2),
        days_renewed    INTEGER NOT NULL,
        paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS sales_receipts_tenant_admin_paid_idx
        ON sales_receipts (tenant_id, admin_id, paid_at DESC)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS sales_receipts`);
  }
}
