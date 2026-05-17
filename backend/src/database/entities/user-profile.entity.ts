import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Plan } from './plan.entity';

@Entity('user_profiles')
export class UserProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  username: string;

  @Column({ name: 'tenant_id', type: 'integer', nullable: true })
  tenantId: number | null;

  @Column({ name: 'plan_id', type: 'integer', nullable: true })
  planId: number | null;

  @Column({ name: 'original_plan_id', type: 'integer', nullable: true })
  originalPlanId: number | null;

  @Column({ name: 'bonus_remaining_bytes', type: 'bigint', default: 0 })
  bonusRemainingBytes: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100, default: '' })
  firstName: string;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mobile: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'duration_days', type: 'integer', default: 30 })
  durationDays: number;

  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Plan, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
