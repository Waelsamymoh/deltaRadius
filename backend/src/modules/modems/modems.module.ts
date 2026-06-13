import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Modem } from '../../database/entities/modem.entity';
import { Nas } from '../../database/entities/nas.entity';
import { ModemsController } from './modems.controller';
import { ModemsService } from './modems.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([Modem, Nas]), SettingsModule],
  controllers: [ModemsController],
  providers: [ModemsService],
})
export class ModemsModule {}
