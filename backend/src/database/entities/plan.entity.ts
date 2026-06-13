import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tenant_id', type: 'integer', nullable: true })
  tenantId: number | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  /** Subscription fee per cycle — displayed in the subscribers/sales tables. */
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  price: number | null;

  @Column({ name: 'download_mbps', type: 'numeric', precision: 10, scale: 2, nullable: true })
  downloadMbps: number | null;

  @Column({ name: 'upload_mbps', type: 'numeric', precision: 10, scale: 2, nullable: true })
  uploadMbps: number | null;

  @Column({ name: 'session_timeout_min', type: 'integer', nullable: true })
  sessionTimeoutMin: number | null;

  @Column({ name: 'download_limit_gb', type: 'numeric', precision: 10, scale: 2, nullable: true })
  downloadLimitGb: number | null;

  @Column({ name: 'upload_limit_gb', type: 'numeric', precision: 10, scale: 2, nullable: true })
  uploadLimitGb: number | null;

  @Column({ name: 'total_limit_gb', type: 'numeric', precision: 10, scale: 2, nullable: true })
  totalLimitGb: number | null;

  @Column({ name: 'burst_download_mbps', type: 'numeric', precision: 10, scale: 2, nullable: true })
  burstDownloadMbps: number | null;

  @Column({ name: 'burst_upload_mbps', type: 'numeric', precision: 10, scale: 2, nullable: true })
  burstUploadMbps: number | null;

  @Column({ name: 'burst_threshold_download_mbps', type: 'numeric', precision: 10, scale: 2, nullable: true })
  burstThresholdDownloadMbps: number | null;

  @Column({ name: 'burst_threshold_upload_mbps', type: 'numeric', precision: 10, scale: 2, nullable: true })
  burstThresholdUploadMbps: number | null;

  @Column({ name: 'burst_time_seconds', type: 'integer', nullable: true })
  burstTimeSeconds: number | null;

  @Column({ name: 'framed_pool', type: 'varchar', length: 100, nullable: true })
  framedPool: string | null;

  @Column({ name: 'quota_action', type: 'varchar', length: 20, default: 'none' })
  quotaAction: 'none' | 'disconnect' | 'switch';

  @Column({ name: 'fallback_plan_id', type: 'integer', nullable: true })
  fallbackPlanId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
