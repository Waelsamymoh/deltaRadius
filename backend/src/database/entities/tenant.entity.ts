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

  /** Contact phone collected during self-registration. */
  @Column({ type: 'varchar', name: 'contact_phone', length: 20, nullable: true })
  contactPhone: string | null;

  /** Time-of-day (HH:MM, 24h) at which renewed subscriptions expire — used by
   *  FreeRADIUS Expiration. Defaults to noon so mid-day renewals don't lose
   *  the rest of the renewal day. Configurable per tenant via Settings. */
  @Column({ type: 'varchar', name: 'default_expiry_time', length: 5, default: '12:00' })
  defaultExpiryTime: string;

  /** Periodic full wipe of radpostauth for this tenant. When enabled, a
   *  background job clears all auth logs every `authLogAutoPurgeDays`. */
  @Column({ name: 'auth_log_auto_purge_enabled', type: 'boolean', default: false })
  authLogAutoPurgeEnabled: boolean;

  @Column({ name: 'auth_log_auto_purge_days', type: 'integer', nullable: true })
  authLogAutoPurgeDays: number | null;

  /** Unit applied to authLogAutoPurgeDays — 'days' or 'hours'. The column name
   *  kept its legacy `_days` suffix for backward-compat; treat it as "value". */
  @Column({ name: 'auth_log_auto_purge_unit', type: 'varchar', length: 8, default: 'days' })
  authLogAutoPurgeUnit: 'days' | 'hours';

  @Column({ name: 'auth_log_last_purge_at', type: 'timestamp', nullable: true })
  authLogLastPurgeAt: Date | null;

  @Column({ unique: true, nullable: true })
  realm: string;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;

  @Column({ type: 'varchar', name: 'sstp_username', nullable: true, unique: true })
  sstpUsername: string | null;

  @Column({ type: 'varchar', name: 'sstp_password', nullable: true })
  sstpPassword: string | null;

  @Column({ type: 'varchar', name: 'sstp_ip', nullable: true, unique: true })
  sstpIp: string | null;

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
