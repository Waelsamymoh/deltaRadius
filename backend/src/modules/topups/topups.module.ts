import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TopupPackage } from '../../database/entities/topup-package.entity';
import { UserTopup } from '../../database/entities/user-topup.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { Plan } from '../../database/entities/plan.entity';
import { RadCheck } from '../../database/entities/radcheck.entity';
import { RadReply } from '../../database/entities/radreply.entity';
import { TopupsController } from './topups.controller';
import { TopupsService } from './topups.service';
import { QuotaModule } from '../quota/quota.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TopupPackage, UserTopup, UserProfile, Plan, RadCheck, RadReply]),
    QuotaModule,
  ],
  controllers: [TopupsController],
  providers: [TopupsService],
  exports: [TopupsService],
})
export class TopupsModule {}
