import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('radgroupcheck')
export class RadGroupCheck {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'groupname' })
  groupName: string;

  @Column()
  attribute: string;

  @Column()
  op: string;

  @Column()
  value: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: number | null;

  @ManyToOne(() => Tenant, (t) => t.radGroupChecks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
