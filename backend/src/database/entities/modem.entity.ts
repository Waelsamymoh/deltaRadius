import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

/** Subscriber modems inventory — a tenant records the physical modems handed
 *  out to its subscribers. Completely independent of the `nas` table (RADIUS
 *  clients): a Modem row is just an asset/inventory record. */
@Entity('modems')
export class Modem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  model: string | null;

  @Column({ name: 'mac_address', type: 'varchar', nullable: true })
  macAddress: string | null;

  @Column({ name: 'serial_number', type: 'varchar', nullable: true })
  serialNumber: string | null;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string | null;

  /** 'active' | 'disabled' */
  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: number | null;

  /** The network (NAS) this modem belongs to — set on MikroTik import. */
  @Column({ name: 'nas_id', type: 'int', nullable: true })
  nasId: number | null;

  /** Last observed cumulative byte counter (rx+tx) — used to compute daily deltas. */
  @Column({ name: 'last_total_bytes', type: 'bigint', nullable: true })
  lastTotalBytes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
