import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RadCheck } from '../../database/entities/radcheck.entity';
import { RadReply } from '../../database/entities/radreply.entity';
import { RadUserGroup } from '../../database/entities/radusergroup.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { Plan } from '../../database/entities/plan.entity';
import { Nas } from '../../database/entities/nas.entity';
import { RadiusUsersController } from './radius-users.controller';
import { RadiusUsersService } from './radius-users.service';
import { QuotaModule } from '../quota/quota.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RadCheck, RadReply, RadUserGroup, UserProfile, Plan, Nas]),
    QuotaModule,
  ],
  controllers: [RadiusUsersController],
  providers: [RadiusUsersService],
})
export class RadiusUsersModule {}
