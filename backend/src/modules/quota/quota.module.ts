import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotaEnforcerService } from './quota-enforcer.service';
import { Plan } from '../../database/entities/plan.entity';
import { RadCheck } from '../../database/entities/radcheck.entity';
import { RadReply } from '../../database/entities/radreply.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { UserDataUsage } from '../../database/entities/user-data-usage.entity';
import { Nas } from '../../database/entities/nas.entity';
import { VoucherCardsModule } from '../voucher-cards/voucher-cards.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plan, RadCheck, RadReply, UserProfile, UserDataUsage, Nas]),
    forwardRef(() => VoucherCardsModule),
  ],
  providers: [QuotaEnforcerService],
  exports: [QuotaEnforcerService],
})
export class QuotaModule {}
