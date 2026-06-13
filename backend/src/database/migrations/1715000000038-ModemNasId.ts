import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive only: links each modem to the network (NAS) it belongs to, so the
 *  UI can group modems per network and produce per-network reports.
 *  Existing modems are backfilled to their tenant's (single) router NAS. */
export class ModemNasId1715000000038 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE modems ADD COLUMN IF NOT EXISTS nas_id INTEGER REFERENCES nas(id) ON DELETE SET NULL`);
    await qr.query(`CREATE INDEX IF NOT EXISTS modems_nas_idx ON modems (nas_id)`);
    // Backfill: associate existing modems with their tenant's router NAS.
    await qr.query(`
      UPDATE modems m
         SET nas_id = (SELECT n.id FROM nas n
                        WHERE n.tenant_id = m.tenant_id AND n.type = 'router'
                        ORDER BY n.id LIMIT 1)
       WHERE m.nas_id IS NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE modems DROP COLUMN IF EXISTS nas_id`);
  }
}
