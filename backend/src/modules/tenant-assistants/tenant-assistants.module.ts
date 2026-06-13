import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { TenantAssistantsController } from './tenant-assistants.controller';
import { TenantAssistantsService } from './tenant-assistants.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser])],
  controllers: [TenantAssistantsController],
  providers: [TenantAssistantsService],
})
export class TenantAssistantsModule {}
