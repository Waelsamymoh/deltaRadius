import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RadAcct } from '../../database/entities/radacct.entity';
import { RadPostAuth } from '../../database/entities/radpostauth.entity';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

@Module({
  imports: [TypeOrmModule.forFeature([RadAcct, RadPostAuth])],
  controllers: [AccountingController],
  providers: [AccountingService],
})
export class AccountingModule {}
