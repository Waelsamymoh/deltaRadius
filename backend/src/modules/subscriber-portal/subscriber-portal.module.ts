import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { SubscriberPortalController } from './subscriber-portal.controller';
import { SubscriberPortalService } from './subscriber-portal.service';
import { RadiusUsersModule } from '../radius-users/radius-users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProfile]),
    RadiusUsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'change_me_in_production',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [SubscriberPortalController],
  providers: [SubscriberPortalService],
})
export class SubscriberPortalModule {}
