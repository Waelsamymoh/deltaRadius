import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RadGroupCheck } from '../../database/entities/radgroupcheck.entity';
import { RadGroupReply } from '../../database/entities/radgroupreply.entity';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [TypeOrmModule.forFeature([RadGroupCheck, RadGroupReply])],
  controllers: [GroupsController],
  providers: [GroupsService],
})
export class GroupsModule {}
