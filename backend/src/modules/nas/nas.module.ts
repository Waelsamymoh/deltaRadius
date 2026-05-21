import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Nas } from '../../database/entities/nas.entity';
import { NasController, PublicNasController } from './nas.controller';
import { NasService } from './nas.service';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [TypeOrmModule.forFeature([Nas]), TenantsModule],
  controllers: [NasController, PublicNasController],
  providers: [NasService],
})
export class NasModule {}
