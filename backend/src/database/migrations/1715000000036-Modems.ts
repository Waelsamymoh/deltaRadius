import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive only: creates the standalone `modems` table. Does NOT touch any
 *  existing table or data (CREATE TABLE IF NOT EXISTS). */
export class Modems1715000000036 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS modems (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(255) NOT NULL,
        model         VARCHAR(255),
        mac_address   VARCHAR(64),
        serial_number VARCHAR(255),
        ip_address    VARCHAR(64),
        status        VARCHAR(32) NOT NULL DEFAULT 'active',
        notes         TEXT,
        tenant_id     INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS modems_tenant_idx ON modems (tenant_id, name)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS modems`);
  }
}
