import { Controller, Get, Delete, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminRole, AdminUser } from '../../database/entities/admin-user.entity';

/** Audit log access: tenant superadmin sees everything in their tenant,
 *  tenant assistants see only their own activity. Owner sees all tenants.  */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.OWNER, AdminRole.SUPERADMIN, AdminRole.ADMIN, AdminRole.TENANT_ASSISTANT)
export class AuditLogsController {
  constructor(private readonly svc: AuditLogsService) {}

  @Get()
  list(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
    @Query('adminId') adminId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list(user, tenantId ? +tenantId : undefined, {
      adminId: adminId ? +adminId : undefined,
      from, to, action,
      limit: limit ? +limit : undefined,
    });
  }

  @Get('summary')
  summary(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.summary(user, tenantId ? +tenantId : undefined, { from, to });
  }

  /** Months with audit-log row counts. Maintenance feature: hidden from
   *  tenant assistants — only the tenant's top admins (and platform owner)
   *  can see or act on retention. */
  @Get('months')
  months(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    if (!this.canManageAuditLogs(user)) throw new ForbiddenException();
    return this.svc.months(user, tenantId ? +tenantId : undefined);
  }

  @Delete('months/:month')
  deleteByMonth(
    @CurrentUser() user: AdminUser,
    @Param('month') month: string,
    @Query('tenantId') tenantId?: string,
  ) {
    if (!this.canManageAuditLogs(user)) throw new ForbiddenException();
    return this.svc.deleteByMonth(user, month, tenantId ? +tenantId : undefined);
  }

  private canManageAuditLogs(user: AdminUser): boolean {
    return (
      user.role === AdminRole.OWNER ||
      user.role === AdminRole.SUPERADMIN ||
      user.role === AdminRole.ADMIN
    );
  }
}
