import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from '../../database/entities/plan.entity';
import { RadGroupReply } from '../../database/entities/radgroupreply.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { QuotaModule } from '../quota/quota.module';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, RadGroupReply]), QuotaModule],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
