import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum AdminRole {
  OWNER             = 'owner',             // SaaS platform owner — sees all tenants
  OWNER_ASSISTANT   = 'owner_assistant',   // owner's helper — cross-tenant access, scoped by `permissions`
  SUPERADMIN        = 'superadmin',        // per-tenant top admin
  ADMIN             = 'admin',             // per-tenant mid admin
  TENANT_ASSISTANT  = 'tenant_assistant',  // per-tenant helper — scoped to ONE tenant, gated by `permissions`
  MODERATOR         = 'moderator',         // per-tenant seller
}

@Entity('admin_users')
export class AdminUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'full_name', nullable: true })
  fullName: string;

  @Column({ type: 'enum', enum: AdminRole, default: AdminRole.ADMIN })
  role: AdminRole;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: number | null;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'sstp_username', type: 'varchar', nullable: true, unique: true })
  sstpUsername: string | null;

  @Column({ name: 'sstp_password', type: 'varchar', nullable: true })
  sstpPassword: string | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true, default: null })
  archivedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  permissions: string[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
