import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Voucher codes must be unique PER TENANT — not globally — so two networks
 * can issue cards with overlapping code sets without colliding.
 * Drops the global UNIQUE(code) and replaces it with UNIQUE(code, tenant_id).
 */
export class VoucherCodePerTenant1715000000018 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE voucher_cards DROP CONSTRAINT IF EXISTS voucher_cards_code_key`);
    await runner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'voucher_cards_code_tenant_key'
        ) THEN
          ALTER TABLE voucher_cards
            ADD CONSTRAINT voucher_cards_code_tenant_key UNIQUE (code, tenant_id);
        END IF;
      END$$;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE voucher_cards DROP CONSTRAINT IF EXISTS voucher_cards_code_tenant_key`);
    // Restoring the global UNIQUE may fail if cross-tenant duplicates now exist.
    await runner.query(`ALTER TABLE voucher_cards ADD CONSTRAINT voucher_cards_code_key UNIQUE (code)`);
  }
}
