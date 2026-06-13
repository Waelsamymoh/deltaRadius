import { Module } from '@nestjs/common';
import { BackupController, TenantBackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  controllers: [BackupController, TenantBackupController],
  providers: [BackupService],
})
export class BackupModule {}
