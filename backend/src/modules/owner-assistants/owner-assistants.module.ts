import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { OwnerAssistantsController } from './owner-assistants.controller';
import { OwnerAssistantsService } from './owner-assistants.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser])],
  controllers: [OwnerAssistantsController],
  providers: [OwnerAssistantsService],
})
export class OwnerAssistantsModule {}
