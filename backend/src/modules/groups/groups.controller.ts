import {
  Controller, Get, Post, Delete,
  Param, Body, UseGuards,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  findAll(@CurrentUser() user: AdminUser) {
    return this.groupsService.findAll(user);
  }

  @Get(':groupName')
  findOne(@Param('groupName') groupName: string, @CurrentUser() user: AdminUser) {
    return this.groupsService.findOne(groupName, user);
  }

  @Post()
  create(@Body() dto: CreateGroupDto, @CurrentUser() user: AdminUser) {
    return this.groupsService.create(dto, user);
  }

  @Delete(':groupName')
  remove(@Param('groupName') groupName: string, @CurrentUser() user: AdminUser) {
    return this.groupsService.remove(groupName, user);
  }
}
