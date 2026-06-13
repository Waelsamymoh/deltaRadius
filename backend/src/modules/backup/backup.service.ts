import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const BACKUP_VERSION = 1;
const INSERT_BATCH = 200;

type ColumnMeta = { name: string; dataType: string };

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** All user/data tables in the public schema (a full-database snapshot). */
  private async listTables(): Promise<string[]> {
    const rows: { table_name: string }[] = await this.dataSource.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
        ORDER BY table_name`,
    );
    return rows.map((r) => r.table_name);
  }

  private async columnsOf(table: string): Promise<ColumnMeta[]> {
    const rows: { column_name: string; data_type: string }[] = await this.dataSource.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
        ORDER BY ordinal_position`,
      [table],
    );
    return rows.map((r) => ({ name: r.column_name, dataType: r.data_type }));
  }

  /** Build the full JSON snapshot: { meta, data: { table: rows[] } }. */
  async export(): Promise<{ meta: any; data: Record<string, any[]> }> {
    const tables = await this.listTables();
    const data: Record<string, any[]> = {};
    let total = 0;
    for (const t of tables) {
      const rows = await this.dataSource.query(`SELECT * FROM "${t}"`);
      data[t] = rows;
      total += rows.length;
    }
    return {
      meta: {
        app: 'deltaRadius',
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        tables,
        totalRows: total,
      },
      data,
    };
  }

  /** Coerce a JS value from the parsed backup into something pg can bind for
   *  the given column type (jsonb objects must be re-stringified). */
  private bind(value: any, dataType: string): any {
    if (value === undefined) return null;
    if (value === null) return null;
    if ((dataType === 'jsonb' || dataType === 'json') && typeof value === 'object') {
      return JSON.stringify(value);
    }
    return value;
  }

  /**
   * Full-replace restore. Inside ONE transaction:
   *  1. disable FK enforcement (session_replication_role = replica)
   *  2. DELETE every table that exists in both the DB and the backup
   *  3. re-insert all rows from the backup (batched)
   *  4. reset serial sequences
   * Any failure rolls the whole thing back — the live data is never left half-written.
   */
  async import(payload: any): Promise<{ tablesRestored: number; rowsRestored: number }> {
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
      throw new BadRequestException('ملف النسخة الاحتياطية غير صالح');
    }
    if (payload.meta?.app && payload.meta.app !== 'deltaRadius') {
      throw new BadRequestException('هذا الملف لا يخص هذا النظام');
    }

    const liveTables = new Set(await this.listTables());
    const backupTables = Object.keys(payload.data).filter((t) => liveTables.has(t));
    if (backupTables.length === 0) {
      throw new BadRequestException('لا توجد جداول معروفة في الملف');
    }
    // Sanity guard: the owner/admin account table must be present & non-empty,
    // otherwise a bad file would lock everyone out.
    if (!Array.isArray(payload.data['admin_users']) || payload.data['admin_users'].length === 0) {
      throw new BadRequestException('الملف لا يحتوي حسابات إدارة — رُفض لتفادي فقدان الوصول');
    }

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    let rowsRestored = 0;
    try {
      // 0) drop every FK constraint so we can clear/insert in any order.
      //    (Neon's role can't SET session_replication_role, but it OWNS the
      //    tables, so dropping/re-adding constraints is permitted. DDL is
      //    transactional, so a rollback restores the constraints too.)
      const fks: { tbl: string; conname: string; def: string }[] = await runner.query(
        `SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE contype='f' AND connamespace='public'::regnamespace`,
      );
      for (const fk of fks) {
        await runner.query(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT "${fk.conname}"`);
      }

      // 1) clear
      for (const t of backupTables) await runner.query(`DELETE FROM "${t}"`);

      // 2) re-insert
      for (const t of backupTables) {
        const rows: any[] = payload.data[t];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const cols = await this.columnsOf(t);
        const colNames = cols.map((c) => c.name);
        const colList = colNames.map((c) => `"${c}"`).join(', ');

        for (let i = 0; i < rows.length; i += INSERT_BATCH) {
          const batch = rows.slice(i, i + INSERT_BATCH);
          const params: any[] = [];
          const tuples: string[] = [];
          for (const row of batch) {
            const ph: string[] = [];
            for (const col of cols) {
              params.push(this.bind(row[col.name], col.dataType));
              ph.push(`$${params.length}`);
            }
            tuples.push(`(${ph.join(', ')})`);
          }
          await runner.query(
            `INSERT INTO "${t}" (${colList}) VALUES ${tuples.join(', ')}`,
            params,
          );
          rowsRestored += batch.length;
        }
      }

      // 3) reset serial/identity sequences so future inserts don't collide
      for (const t of backupTables) {
        const seqCols: { column_name: string }[] = await runner.query(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name=$1
              AND column_default LIKE 'nextval(%'`,
          [t],
        );
        for (const { column_name } of seqCols) {
          await runner.query(
            `SELECT setval(pg_get_serial_sequence($1, $2),
                           GREATEST((SELECT COALESCE(MAX("${column_name}"), 0) FROM "${t}"), 1))`,
            [t, column_name],
          );
        }
      }

      // 4) re-add the FK constraints. If the restored data violates referential
      //    integrity, this throws and the whole transaction rolls back.
      for (const fk of fks) {
        await runner.query(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT "${fk.conname}" ${fk.def}`);
      }

      await runner.commitTransaction();
      this.logger.log(`Backup restored: ${backupTables.length} tables, ${rowsRestored} rows`);
      return { tablesRestored: backupTables.length, rowsRestored };
    } catch (e: any) {
      await runner.rollbackTransaction();
      this.logger.error(`Restore failed, rolled back: ${e.message}`);
      throw new BadRequestException(`فشل الاستعادة (لم تتغيّر البيانات): ${e.message}`);
    } finally {
      await runner.release();
    }
  }

  // ── Per-tenant backup / restore ─────────────────────────────────

  /** Public base tables that carry a `tenant_id` column. */
  private async tenantScopedTables(): Promise<string[]> {
    const rows: { table_name: string }[] = await this.dataSource.query(
      `SELECT c.table_name
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema='public' AND c.column_name='tenant_id'
          AND t.table_type='BASE TABLE'
        ORDER BY c.table_name`,
    );
    return rows.map((r) => r.table_name);
  }

  /** Export ONE tenant's data: the tenants row + every tenant-scoped table
   *  filtered to that tenant. */
  async exportTenant(tenantId: number): Promise<{ meta: any; data: Record<string, any[]> }> {
    const tables = await this.tenantScopedTables();
    const data: Record<string, any[]> = {};
    let total = 0;

    // The tenant's own row (settings, sstp, etc.)
    data['tenants'] = await this.dataSource.query(`SELECT * FROM "tenants" WHERE id = $1`, [tenantId]);

    for (const t of tables) {
      const rows = await this.dataSource.query(`SELECT * FROM "${t}" WHERE tenant_id = $1`, [tenantId]);
      data[t] = rows;
      total += rows.length;
    }
    return {
      meta: { app: 'deltaRadius', scope: 'tenant', tenantId, version: BACKUP_VERSION, createdAt: new Date().toISOString(), totalRows: total },
      data,
    };
  }

  /**
   * Restore ONE tenant from a tenant-scoped backup. Replaces ONLY this tenant's
   * rows (other tenants are never touched). All restored rows are forced to the
   * target tenantId, so a backup can only ever land in the authenticated tenant.
   */
  async importTenant(payload: any, tenantId: number): Promise<{ tablesRestored: number; rowsRestored: number }> {
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
      throw new BadRequestException('ملف النسخة الاحتياطية غير صالح');
    }
    if (payload.meta?.app && payload.meta.app !== 'deltaRadius') {
      throw new BadRequestException('هذا الملف لا يخص هذا النظام');
    }
    // Guard: only tenant-scoped files may be restored here (never a whole-DB backup).
    if (payload.meta?.scope !== 'tenant') {
      throw new BadRequestException('هذا الملف ليس نسخة عميل — استخدم ملفاً تم تنزيله من صفحة النسخ الاحتياطي للعميل');
    }

    const liveScoped = new Set(await this.tenantScopedTables());
    const backupTables = Object.keys(payload.data).filter((t) => liveScoped.has(t));

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    let rowsRestored = 0;
    try {
      // Drop all FK constraints (re-added at the end — validates integrity).
      const fks: { tbl: string; conname: string; def: string }[] = await runner.query(
        `SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
           FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace`,
      );
      for (const fk of fks) await runner.query(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT "${fk.conname}"`);

      // 1) clear only THIS tenant's rows
      for (const t of backupTables) await runner.query(`DELETE FROM "${t}" WHERE tenant_id = $1`, [tenantId]);

      // 2) re-insert, forcing tenant_id to the target tenant
      for (const t of backupTables) {
        const rows: any[] = payload.data[t];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const cols = await this.columnsOf(t);
        const colList = cols.map((c) => `"${c.name}"`).join(', ');
        for (let i = 0; i < rows.length; i += INSERT_BATCH) {
          const batch = rows.slice(i, i + INSERT_BATCH);
          const params: any[] = [];
          const tuples: string[] = [];
          for (const row of batch) {
            const ph: string[] = [];
            for (const col of cols) {
              const v = col.name === 'tenant_id' ? tenantId : this.bind(row[col.name], col.dataType);
              params.push(v);
              ph.push(`$${params.length}`);
            }
            tuples.push(`(${ph.join(', ')})`);
          }
          await runner.query(`INSERT INTO "${t}" (${colList}) VALUES ${tuples.join(', ')}`, params);
          rowsRestored += batch.length;
        }
      }

      // 3) update the tenant's own settings row (never delete it — would cascade)
      const tRow = Array.isArray(payload.data['tenants']) ? payload.data['tenants'][0] : null;
      if (tRow) {
        const cols = (await this.columnsOf('tenants')).filter((c) => c.name !== 'id');
        const sets = cols.map((c, i) => `"${c.name}" = $${i + 2}`).join(', ');
        const params = [tenantId, ...cols.map((c) => this.bind(tRow[c.name], c.dataType))];
        await runner.query(`UPDATE "tenants" SET ${sets} WHERE id = $1`, params);
      }

      // 4) re-add FK constraints (validates referential integrity)
      for (const fk of fks) await runner.query(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT "${fk.conname}" ${fk.def}`);

      await runner.commitTransaction();
      this.logger.log(`Tenant ${tenantId} restored: ${backupTables.length} tables, ${rowsRestored} rows`);
      return { tablesRestored: backupTables.length, rowsRestored };
    } catch (e: any) {
      await runner.rollbackTransaction();
      this.logger.error(`Tenant restore failed, rolled back: ${e.message}`);
      throw new BadRequestException(`فشل الاستعادة (لم تتغيّر البيانات): ${e.message}`);
    } finally {
      await runner.release();
    }
  }
}
