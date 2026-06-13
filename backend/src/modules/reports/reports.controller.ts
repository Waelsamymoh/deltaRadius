import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

/** Tenant-scoped consumption reports. Gated by `accounting.view` so the same
 *  permission that exposes the live accounting dashboards also grants reports. */
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('accounting.view')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('yearly')
  yearly(
    @CurrentUser() user: AdminUser,
    @Query('years') years?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.yearly(user, years ? +years : 5, tenantId ? +tenantId : undefined);
  }

  @Get('monthly')
  monthly(
    @CurrentUser() user: AdminUser,
    @Query('year') year: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.monthly(user, +year, tenantId ? +tenantId : undefined);
  }

  @Get('daily')
  daily(
    @CurrentUser() user: AdminUser,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.daily(user, +year, +month, tenantId ? +tenantId : undefined);
  }

  @Get('daily/subscribers')
  dailySubscribers(
    @CurrentUser() user: AdminUser,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('day') day: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.dailySubscribers(user, +year, +month, +day, tenantId ? +tenantId : undefined);
  }
}
