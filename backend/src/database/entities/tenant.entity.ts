import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { Nas } from './nas.entity';
import { RadCheck } from './radcheck.entity';
import { RadReply } from './radreply.entity';
import { RadGroupCheck } from './radgroupcheck.entity';
import { RadGroupReply } from './radgroupreply.entity';
import { RadUserGroup } from './radusergroup.entity';
import { RadAcct } from './radacct.entity';
import { RadPostAuth } from './radpostauth.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  subdomain: string | null;

  @Column({ type: 'varchar', name: 'business_name', nullable: true })
  businessName: string | null;

  @Column({ unique: true, nullable: true })
  realm: string;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Nas, (nas) => nas.tenant)
  nasDevices: Nas[];

  @OneToMany(() => RadCheck, (r) => r.tenant)
  radChecks: RadCheck[];

  @OneToMany(() => RadReply, (r) => r.tenant)
  radReplies: RadReply[];

  @OneToMany(() => RadGroupCheck, (r) => r.tenant)
  radGroupChecks: RadGroupCheck[];

  @OneToMany(() => RadGroupReply, (r) => r.tenant)
  radGroupReplies: RadGroupReply[];

  @OneToMany(() => RadUserGroup, (r) => r.tenant)
  radUserGroups: RadUserGroup[];

  @OneToMany(() => RadAcct, (r) => r.tenant)
  radAccts: RadAcct[];

  @OneToMany(() => RadPostAuth, (r) => r.tenant)
  radPostAuths: RadPostAuth[];
}
