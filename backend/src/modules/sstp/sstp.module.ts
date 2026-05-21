import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SstpController } from './sstp.controller';
import { SstpService } from './sstp.service';
import { Tenant } from '../../database/entities/tenant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [SstpController],
  providers: [SstpService],
})
export class SstpModule {}
