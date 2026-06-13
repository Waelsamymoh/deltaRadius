import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities/tenant.entity';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { Nas } from '../../database/entities/nas.entity';
import { RadCheck } from '../../database/entities/radcheck.entity';
import { RadAcct } from '../../database/entities/radacct.entity';
import { Plan } from '../../database/entities/plan.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { VoucherCard } from '../../database/entities/voucher-card.entity';
import { TopupPackage } from '../../database/entities/topup-package.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, AdminUser, Nas, RadCheck, RadAcct, Plan, UserProfile, VoucherCard, TopupPackage])],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
