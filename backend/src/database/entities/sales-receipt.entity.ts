import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

/** Snapshot of a renewal sale — captures who processed the renewal, for which
 *  subscriber, with what plan/price. Survives plan renames and assistant
 *  deletions by snapshotting human-readable names alongside FK ids. */
@Entity('sales_receipts')
@Index(['tenantId', 'adminId', 'paidAt'])
export class SalesReceipt {
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

  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ name: 'subscriber_name', type: 'varchar', length: 255, nullable: true })
  subscriberName: string | null;

  @Column({ name: 'plan_id', type: 'integer', nullable: true })
  planId: number | null;

  @Column({ name: 'plan_name', type: 'varchar', length: 255, nullable: true })
  planName: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  price: string | null;

  @Column({ name: 'days_renewed', type: 'integer' })
  daysRenewed: number;

  @CreateDateColumn({ name: 'paid_at', type: 'timestamptz' })
  paidAt: Date;
}
