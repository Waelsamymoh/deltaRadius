import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('topup_packages')
export class TopupPackage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'size_gb', type: 'numeric', precision: 10, scale: 2 })
  sizeGb: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  price: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: number | null;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
