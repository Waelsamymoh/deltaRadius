import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('user_data_usage')
@Index(['username', 'tenantId'], { unique: true })
export class UserDataUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  username: string;

  @Column({ name: 'tenant_id', type: 'integer', nullable: true })
  tenantId: number | null;

  @Column({ name: 'total_download_bytes', type: 'bigint', default: '0' })
  totalDownloadBytes: string;

  @Column({ name: 'total_upload_bytes', type: 'bigint', default: '0' })
  totalUploadBytes: string;

  @Column({ name: 'updated_at', type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column({ name: 'quota_reset_at', type: 'timestamp with time zone', default: () => "'1970-01-01'" })
  quotaResetAt: Date;

  @Column({ name: 'quota_reset_radacct_id', type: 'bigint', default: '0' })
  quotaResetRadacctId: string;
}
