import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { TopupPackage } from './topup-package.entity';
import { Tenant } from './tenant.entity';
import { AdminUser } from './admin-user.entity';

@Entity('user_topups')
export class UserTopup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  username: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: number | null;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ name: 'package_id', nullable: true })
  packageId: number | null;

  @ManyToOne(() => TopupPackage, { onDelete: 'SET NULL', nullable: true, eager: true })
  @JoinColumn({ name: 'package_id' })
  package: TopupPackage | null;

  @Column({ name: 'size_gb', type: 'numeric', precision: 10, scale: 2 })
  sizeGb: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  price: string;

  @CreateDateColumn({ name: 'applied_at' })
  appliedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'consumed_bytes', type: 'bigint', default: 0 })
  consumedBytes: string;

  @Column({ name: 'applied_by', nullable: true })
  appliedBy: number | null;

  @ManyToOne(() => AdminUser, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'applied_by' })
  appliedByUser: AdminUser | null;
}
