import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SstpController } from './sstp.controller';
import { SstpService } from './sstp.service';
import { AdminUser } from '../../database/entities/admin-user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser])],
  controllers: [SstpController],
  providers: [SstpService],
})
export class SstpModule {}
