import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Tenant } from './entities/tenant.entity';
import { Nas } from './entities/nas.entity';
import { RadCheck } from './entities/radcheck.entity';
import { RadReply } from './entities/radreply.entity';
import { RadGroupCheck } from './entities/radgroupcheck.entity';
import { RadGroupReply } from './entities/radgroupreply.entity';
import { RadUserGroup } from './entities/radusergroup.entity';
import { RadAcct } from './entities/radacct.entity';
import { RadPostAuth } from './entities/radpostauth.entity';
import { AdminUser } from './entities/admin-user.entity';
import { Plan } from './entities/plan.entity';
import { UserProfile } from './entities/user-profile.entity';
import { UserDataUsage } from './entities/user-data-usage.entity';
import { VoucherCard } from './entities/voucher-card.entity';
import { TopupPackage } from './entities/topup-package.entity';
import { UserTopup } from './entities/user-topup.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('database.url');
        const base = {
          type: 'postgres' as const,
          synchronize: false,
          logging: process.env.NODE_ENV === 'development',
          entities: [
            Tenant, Nas, RadCheck, RadReply, RadGroupCheck,
            RadGroupReply, RadUserGroup, RadAcct, RadPostAuth, AdminUser, Plan, UserProfile,
            UserDataUsage, VoucherCard, TopupPackage, UserTopup,
          ],
          migrations: ['dist/database/migrations/*.js'],
        };
        return url
          ? { ...base, url, ssl: { rejectUnauthorized: false } }
          : {
              ...base,
              host: config.get<string>('database.host'),
              port: config.get<number>('database.port'),
              database: config.get<string>('database.name'),
              username: config.get<string>('database.username'),
              password: config.get<string>('database.password'),
            };
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
