import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Nas } from '../../database/entities/nas.entity';
import { NasController } from './nas.controller';
import { NasService } from './nas.service';

@Module({
  imports: [TypeOrmModule.forFeature([Nas])],
  controllers: [NasController],
  providers: [NasService],
})
export class NasModule {}
