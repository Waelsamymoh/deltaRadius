import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('nas')
export class Nas {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nasname: string;

  @Column({ nullable: true })
  shortname: string;

  @Column({ nullable: true })
  type: string;

  @Column({ nullable: true })
  ports: number;

  @Column({ nullable: true })
  secret: string;

  @Column({ nullable: true })
  server: string;

  @Column({ nullable: true })
  community: string;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: number | null;

  @ManyToOne(() => Tenant, (t) => t.nasDevices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
