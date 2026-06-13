import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, Query,
} from '@nestjs/common';
import { RadiusUsersService } from './radius-users.service';
import { CreateRadiusUserDto } from './dto/create-user.dto';
import { UpdateRadiusUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

/** Each endpoint declares its OWN required permission so tenant supervisors
 *  can be granted granular access (only edit, only suspend, etc.) without
 *  receiving full "users.manage" rights. Owner / superadmin / admin bypass
 *  these checks (see PermissionsGuard). */
@Controller('radius-users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RadiusUsersController {
  constructor(private readonly radiusUsersService: RadiusUsersService) {}

  @Get()
  @RequirePermissions('users.manage', 'users.sales')
  findAll(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: 'online' | 'active' | 'suspended' | 'archived' | 'all',
    @Query('search') search?: string,
  ) {
    return this.radiusUsersService.findAll(user, tenantId ? +tenantId : undefined, status, search);
  }

  @Get(':username/stats')
  @RequirePermissions('users.view_detail')
  getStats(
    @Param('username') username: string,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.getStats(username, user, tenantId ? +tenantId : undefined);
  }

  @Post(':username/kick')
  @RequirePermissions('users.suspend')
  kick(
    @Param('username') username: string,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.kickByUser(username, user, tenantId ? +tenantId : undefined);
  }

  @Get(':username')
  @RequirePermissions('users.view_detail')
  findOne(
    @Param('username') username: string,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.findOne(username, user, tenantId ? +tenantId : undefined);
  }

  @Post()
  @RequirePermissions('users.create')
  create(
    @Body() dto: CreateRadiusUserDto,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.create(dto, user, tenantId ? +tenantId : undefined);
  }

  @Patch(':username')
  @RequirePermissions('users.edit')
  update(
    @Param('username') username: string,
    @Body() dto: UpdateRadiusUserDto,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.update(username, dto, user, tenantId ? +tenantId : undefined);
  }

  /** Renewal: extend the subscription by overwriting startDate + durationDays,
   *  optionally swapping the plan at the same time. Separated from PATCH so it
   *  has its OWN permission key (`users.renew`). */
  @Post(':username/renew')
  @RequirePermissions('users.renew')
  renew(
    @Param('username') username: string,
    @Body() dto: { startDate: string; durationDays: number; planId?: number },
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    const payload: Partial<UpdateRadiusUserDto> = {
      startDate: dto.startDate,
      durationDays: dto.durationDays,
    };
    if (dto.planId != null) (payload as any).planId = dto.planId;
    return this.radiusUsersService.update(
      username,
      payload as UpdateRadiusUserDto,
      user,
      tenantId ? +tenantId : undefined,
    );
  }

  /** Soft-delete = archive. Kicks the user offline + blocks RADIUS auth. */
  @Delete(':username')
  @RequirePermissions('users.delete')
  remove(
    @Param('username') username: string,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.remove(username, user, tenantId ? +tenantId : undefined);
  }

  @Post(':username/restore')
  @RequirePermissions('users.delete')
  restore(
    @Param('username') username: string,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.restore(username, user, tenantId ? +tenantId : undefined);
  }

  @Post(':username/suspend')
  @RequirePermissions('users.suspend')
  suspend(
    @Param('username') username: string,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.suspend(username, user, tenantId ? +tenantId : undefined);
  }

  @Post(':username/resume')
  @RequirePermissions('users.suspend')
  resume(
    @Param('username') username: string,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.resume(username, user, tenantId ? +tenantId : undefined);
  }

  /** Adjust the subscriber's consumption counter by an amount of gigabytes
   *  (positive to add, negative to subtract). Used for migrations from other
   *  systems where prior usage must be carried over. */
  @Post(':username/adjust-usage')
  @RequirePermissions('users.edit')
  adjustUsage(
    @Param('username') username: string,
    @Body() dto: { addGb: number },
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.adjustUsage(username, Number(dto.addGb), user, tenantId ? +tenantId : undefined);
  }

  /** Clear session history without touching the consumption counter. */
  @Delete(':username/sessions')
  @RequirePermissions('users.delete')
  clearSessions(
    @Param('username') username: string,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.clearSessions(username, user, tenantId ? +tenantId : undefined);
  }

  /** Hard-delete — only allowed when already archived. */
  @Delete(':username/permanent')
  @RequirePermissions('users.delete')
  removePermanent(
    @Param('username') username: string,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.radiusUsersService.removePermanent(username, user, tenantId ? +tenantId : undefined);
  }
}
