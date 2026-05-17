import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('radreply')
export class RadReply {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'username' })
  username: string;

  @Column()
  attribute: string;

  @Column()
  op: string;

  @Column()
  value: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: number | null;

  @ManyToOne(() => Tenant, (t) => t.radReplies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
