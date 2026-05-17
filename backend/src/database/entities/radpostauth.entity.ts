import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('radpostauth')
export class RadPostAuth {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column({ nullable: true })
  pass: string;

  @Column({ nullable: true })
  reply: string;

  @Column({ name: 'authdate', type: 'timestamptz', default: () => 'NOW()' })
  authDate: Date;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: number | null;

  @ManyToOne(() => Tenant, (t) => t.radPostAuths, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
