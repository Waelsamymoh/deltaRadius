import { Controller, Get, Delete, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { SalesReceiptsService } from './sales-receipts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

/** Per-supervisor receipts of subscriber renewals they processed.
 *  Gated by `users.renew` — if you can renew, you can see your own receipts.
 *  Tenant admins (full-access roles) bypass the per-assistant filter inside
 *  the service and see all receipts in their tenant. */
@Controller('sales-receipts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('users.renew')
export class SalesReceiptsController {
  constructor(private readonly svc: SalesReceiptsService) {}

  @Get()
  list(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
    @Query('adminId') adminId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.list(user, tenantId ? +tenantId : undefined, {
      adminId: adminId ? +adminId : undefined,
      from, to,
    });
  }

  @Get('summary')
  summary(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.summaryByAdmin(user, tenantId ? +tenantId : undefined, { from, to });
  }

  /** Delete a receipt — manager (owner/superadmin/admin) only; enforced in the service. */
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.remove(user, id, tenantId ? +tenantId : undefined);
  }
}
