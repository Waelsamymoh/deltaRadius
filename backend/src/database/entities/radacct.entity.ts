import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('radacct')
export class RadAcct {
  @PrimaryGeneratedColumn({ name: 'radacctid' })
  id: number;

  @Column({ name: 'acctsessionid' })
  acctSessionId: string;

  @Column({ name: 'acctuniqueid', unique: true })
  acctUniqueId: string;

  @Column({ name: 'username', nullable: true })
  username: string;

  @Column({ nullable: true })
  realm: string;

  @Column({ name: 'nasipaddress' })
  nasIpAddress: string;

  @Column({ name: 'nasportid', nullable: true })
  nasPortId: string;

  @Column({ name: 'nasporttype', nullable: true })
  nasPortType: string;

  @Column({ name: 'acctstarttime', type: 'timestamptz', nullable: true })
  acctStartTime: Date;

  @Column({ name: 'acctupdatetime', type: 'timestamptz', nullable: true })
  acctUpdateTime: Date;

  @Column({ name: 'acctstoptime', type: 'timestamptz', nullable: true })
  acctStopTime: Date;

  @Column({ name: 'acctsessiontime', type: 'bigint', nullable: true })
  acctSessionTime: number;

  @Column({ name: 'acctauthentic', nullable: true })
  acctAuthentic: string;

  @Column({ name: 'connectinfo_start', nullable: true })
  connectInfoStart: string;

  @Column({ name: 'connectinfo_stop', nullable: true })
  connectInfoStop: string;

  @Column({ name: 'acctinputoctets', type: 'bigint', nullable: true })
  acctInputOctets: number;

  @Column({ name: 'acctoutputoctets', type: 'bigint', nullable: true })
  acctOutputOctets: number;

  @Column({ name: 'calledstationid', nullable: true })
  calledStationId: string;

  @Column({ name: 'callingstationid', nullable: true })
  callingStationId: string;

  @Column({ name: 'acctterminatecause', nullable: true })
  acctTerminateCause: string;

  @Column({ name: 'servicetype', nullable: true })
  serviceType: string;

  @Column({ name: 'framedprotocol', nullable: true })
  framedProtocol: string;

  @Column({ name: 'framedipaddress', type: 'inet', nullable: true })
  framedIpAddress: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: number | null;

  @ManyToOne(() => Tenant, (t) => t.radAccts, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
