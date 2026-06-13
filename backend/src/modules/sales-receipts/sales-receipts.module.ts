import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesReceipt } from '../../database/entities/sales-receipt.entity';
import { SalesReceiptsController } from './sales-receipts.controller';
import { SalesReceiptsService } from './sales-receipts.service';

@Module({
  imports: [TypeOrmModule.forFeature([SalesReceipt])],
  controllers: [SalesReceiptsController],
  providers: [SalesReceiptsService],
})
export class SalesReceiptsModule {}
