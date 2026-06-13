import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

/** Activity log — captures every mutating action across the dashboard plus
 *  selected reads. Snapshots admin identity so deletions/renames don't break
 *  history. Scoped by tenant. */
@Entity('audit_logs')
@Index(['tenantId', 'adminId', 'createdAt'])
@Index(['tenantId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tenant_id', type: 'integer', nullable: true })
  tenantId: number | null;

  @Column({ name: 'admin_id', type: 'integer', nullable: true })
  adminId: number | null;

  @Column({ name: 'admin_email', type: 'varchar', length: 255, nullable: true })
  adminEmail: string | null;

  @Column({ name: 'admin_name', type: 'varchar', length: 255, nullable: true })
  adminName: string | null;

  @Column({ name: 'admin_role', type: 'varchar', length: 32, nullable: true })
  adminRole: string | null;

  /** HTTP method (GET/POST/PATCH/DELETE) for the request that triggered this. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  method: string | null;

  /** Stripped URL path (no host/query) — useful for grouping by feature. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  path: string | null;

  /** Stable action code, e.g. "subscriber.create", "subscriber.renew". */
  @Column({ type: 'varchar', length: 64 })
  action: string;

  /** Human-readable Arabic description, e.g. "جدّد المشترك أحمد 30 يوم". */
  @Column({ type: 'text' })
  description: string;

  /** Optional referenced entity (e.g. "subscriber"+username, "plan"+id). */
  @Column({ name: 'entity_type', type: 'varchar', length: 32, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_key', type: 'varchar', length: 255, nullable: true })
  entityKey: string | null;

  /** Arbitrary structured detail (request body, ids, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  /** HTTP status code at the time the log was written. */
  @Column({ name: 'status_code', type: 'integer', nullable: true })
  statusCode: number | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
