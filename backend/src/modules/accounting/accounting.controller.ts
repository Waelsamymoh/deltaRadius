import { Controller, Get, Delete, Post, Put, Query, Param, Body, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

@Controller('accounting')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('accounting.view')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('sessions')
  sessions(
    @CurrentUser() user: AdminUser,
    @Query('active') active?: string,
  ) {
    const onlyActive = active === 'true' ? true : active === 'false' ? false : undefined;
    return this.accountingService.findSessions(user, onlyActive);
  }

  @Get('auth-logs')
  authLogs(@CurrentUser() user: AdminUser) {
    return this.accountingService.findAuthLogs(user);
  }

  @Get('auth-logs/months')
  authLogMonths(@CurrentUser() user: AdminUser) {
    return this.accountingService.authLogMonths(user);
  }

  @Delete('auth-logs/months/:month')
  deleteAuthLogsByMonth(
    @CurrentUser() user: AdminUser,
    @Param('month') month: string,
  ) {
    return this.accountingService.deleteAuthLogsByMonth(user, month);
  }

  @Delete('auth-logs')
  deleteAllAuthLogs(@CurrentUser() user: AdminUser) {
    return this.accountingService.deleteAllAuthLogs(user);
  }

  @Get('auth-logs/auto-purge')
  getAuthLogAutoPurge(@CurrentUser() user: AdminUser) {
    return this.accountingService.getAuthLogAutoPurge(user);
  }

  @Put('auth-logs/auto-purge')
  setAuthLogAutoPurge(
    @CurrentUser() user: AdminUser,
    @Body() body: { enabled: boolean; days?: number | null; unit?: 'days' | 'hours' },
  ) {
    return this.accountingService.setAuthLogAutoPurge(user, body);
  }

  @Get('stats')
  stats(@CurrentUser() user: AdminUser) {
    return this.accountingService.stats(user);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AdminUser) {
    return this.accountingService.dashboardStats(user);
  }

  @Post('sessions/cleanup-stale')
  cleanupStale(@CurrentUser() user: AdminUser) {
    return this.accountingService.cleanupStaleSessions(user);
  }
}
