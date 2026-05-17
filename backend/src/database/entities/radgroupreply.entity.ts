import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('radgroupreply')
export class RadGroupReply {
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

  @ManyToOne(() => Tenant, (t) => t.radGroupReplies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
