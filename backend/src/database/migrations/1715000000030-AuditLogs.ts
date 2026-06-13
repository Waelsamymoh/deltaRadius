import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLogs1715000000030 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id           SERIAL PRIMARY KEY,
        tenant_id    INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        admin_id     INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
        admin_email  VARCHAR(255),
        admin_name   VARCHAR(255),
        admin_role   VARCHAR(32),
        method       VARCHAR(10),
        path         VARCHAR(500),
        action       VARCHAR(64) NOT NULL,
        description  TEXT NOT NULL,
        entity_type  VARCHAR(32),
        entity_key   VARCHAR(255),
        metadata     JSONB,
        status_code  INTEGER,
        ip_address   VARCHAR(64),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS audit_logs_tenant_admin_idx ON audit_logs (tenant_id, admin_id, created_at DESC)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx       ON audit_logs (tenant_id, created_at DESC)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS audit_logs`);
  }
}
