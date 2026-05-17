import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Plan } from './plan.entity';
import { Tenant } from './tenant.entity';

@Entity('voucher_cards')
export class VoucherCard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column({ name: 'plan_id' })
  planId: number;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: number | null;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ name: 'batch_name', type: 'varchar', nullable: true })
  batchName: string | null;

  // unused | active | expired | disabled
  @Column({ default: 'unused' })
  status: string;

  @Column({ name: 'duration_days' })
  durationDays: number;

  // first_use | creation
  @Column({ name: 'start_mode', default: 'first_use' })
  startMode: string;

  @Column({ name: 'expires_at', nullable: true, type: 'timestamp' })
  expiresAt: Date | null;

  @Column({ name: 'activated_at', nullable: true, type: 'timestamp' })
  activatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // both | username_only
  @Column({ name: 'auth_mode', type: 'varchar', default: 'both' })
  authMode: string;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;
}
