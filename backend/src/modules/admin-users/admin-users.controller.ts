import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminRole, AdminUser } from '../../database/entities/admin-user.entity';

@Controller('admin-users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.OWNER, AdminRole.SUPERADMIN, AdminRole.ADMIN)
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get()
  findAll(@CurrentUser() user: AdminUser) {
    return this.service.findAll(user);
  }

  @Get('archived')
  findArchived(@CurrentUser() user: AdminUser) {
    return this.service.findArchived(user);
  }

  @Post()
  create(@Body() dto: CreateAdminUserDto, @CurrentUser() user: AdminUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() user: AdminUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Get(':id/permissions')
  getPermissions(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.service.getPermissions(id, user);
  }

  @Patch(':id/permissions')
  setPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body('permissions') permissions: string[],
    @CurrentUser() user: AdminUser,
  ) {
    return this.service.setPermissions(id, permissions, user);
  }

  @Post(':id/archive')
  archive(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.service.archive(id, user);
  }

  @Post(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.service.restore(id, user);
  }

  @Delete(':id/permanent')
  permanentDelete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.service.permanentDelete(id, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.service.remove(id, user);
  }
}
