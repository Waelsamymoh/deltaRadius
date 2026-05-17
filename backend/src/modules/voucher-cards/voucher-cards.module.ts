import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoucherCard } from '../../database/entities/voucher-card.entity';
import { Plan } from '../../database/entities/plan.entity';
import { RadCheck } from '../../database/entities/radcheck.entity';
import { RadUserGroup } from '../../database/entities/radusergroup.entity';
import { VoucherCardsController } from './voucher-cards.controller';
import { VoucherCardsService } from './voucher-cards.service';

@Module({
  imports: [TypeOrmModule.forFeature([VoucherCard, Plan, RadCheck, RadUserGroup])],
  controllers: [VoucherCardsController],
  providers: [VoucherCardsService],
  exports: [VoucherCardsService],
})
export class VoucherCardsModule {}
