import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, ParseIntPipe, UseGuards, Res, ForbiddenException, Query,
} from '@nestjs/common';
import type { Response } from 'express';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AdminRole, AdminUser } from '../../database/entities/admin-user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { isOwnerSide, hasPermission } from '../../common/helpers/tenant.helper';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminRole.OWNER, AdminRole.OWNER_ASSISTANT, AdminRole.SUPERADMIN)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AdminUser,
    @Query('includeArchived') includeArchived?: string,
  ) {
    // Per-tenant admins see only their own tenant; owner-side sees all.
    if (!isOwnerSide(user)) {
      return user.tenantId ? this.tenantsService.findOne(user.tenantId).then(t => [t]) : [];
    }
    return this.tenantsService.findAll(includeArchived === 'true');
  }

  /** Tenant-scoped settings, auto-resolved from the JWT — no `:id` so the
   *  caller can never accidentally hit another tenant's settings. */
  @Get('settings')
  getSettings(@CurrentUser() user: AdminUser) {
    if (!user.tenantId) throw new ForbiddenException('لا يوجد عميل مرتبط بحسابك');
    return this.tenantsService.getSettings(user.tenantId);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: AdminUser, @Body() dto: { defaultExpiryTime?: string }) {
    if (!user.tenantId) throw new ForbiddenException('لا يوجد عميل مرتبط بحسابك');
    return this.tenantsService.updateSettings(user.tenantId, dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    if (!isOwnerSide(user) && user.tenantId !== id) {
      throw new ForbiddenException('غير مصرح بالوصول لبيانات هذا العميل');
    }
    return this.tenantsService.findOne(id);
  }

  @Get(':id/summary')
  summary(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    if (!isOwnerSide(user) && user.tenantId !== id) {
      throw new ForbiddenException('غير مصرح بالوصول لبيانات هذا العميل');
    }
    return this.tenantsService.getSummary(id);
  }

  @Get(':id/mikrotik-script')
  async mikrotikScript(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AdminUser,
    @Res() res: Response,
  ) {
    if (!isOwnerSide(user) && user.tenantId !== id) {
      throw new ForbiddenException('غير مصرح بالوصول لبيانات هذا العميل');
    }
    const tenant = await this.tenantsService.findOne(id);
    const script = this.tenantsService.buildMikrotikScript(tenant);
    const filename = `mikrotik-${tenant.subdomain || tenant.name || 'tenant'}.rsc`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(script);
  }

  @Post()
  @Roles(AdminRole.OWNER, AdminRole.OWNER_ASSISTANT)
  @RequirePermissions('tenants.manage')
  create(@Body() dto: CreateTenantDto) {
    // New tenants start with NO SSTP credentials and NO auto-NAS.
    // They add NAS devices themselves from the NAS page (each device gets its
    // own SSTP user + static IP). Owner can still generate tenant-level SSTP
    // later from the tenant detail page if desired.
    return this.tenantsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: AdminUser,
  ) {
    // Non-owner-side: must be the tenant's own admin
    if (!isOwnerSide(user)) {
      if (user.tenantId !== id) {
        throw new ForbiddenException('غير مصرح بتعديل بيانات هذا العميل');
      }
      delete (dto as any).sstpIp;
      delete (dto as any).sstpUsername;
      delete (dto as any).sstpPassword;
    } else if (user.role !== AdminRole.OWNER && !hasPermission(user, 'tenants.manage')) {
      throw new ForbiddenException('ليس لديك صلاحية إدارة العملاء');
    }
    // Only OWNER (not assistant) may rewrite the static SSTP IP — this matches
    // the "IP يُعدَّل من حساب المالك فقط" guarantee shown in the UI.
    if (user.role !== AdminRole.OWNER) {
      delete (dto as any).sstpIp;
    }
    return this.tenantsService.update(id, dto);
  }

  @Post(':id/regenerate-sstp')
  @Roles(AdminRole.OWNER, AdminRole.OWNER_ASSISTANT)
  @RequirePermissions('tenants.manage')
  regenerateSstp(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.regenerateSstpCredentials(id);
  }

  @Patch(':id/admin-password')
  @Roles(AdminRole.OWNER, AdminRole.OWNER_ASSISTANT)
  @RequirePermissions('tenants.manage')
  resetAdminPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body('password') password: string,
  ) {
    return this.tenantsService.resetAdminPassword(id, password);
  }

  /**
   * Default "delete" → soft-archive (kicks SSTP sessions + removes from chap-secrets,
   * keeps the data so the tenant can be restored later).
   */
  @Delete(':id')
  @Roles(AdminRole.OWNER)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.archive(id);
  }

  @Post(':id/restore')
  @Roles(AdminRole.OWNER)
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.restore(id);
  }

  /** Permanent hard-delete — only allowed after the tenant is archived. */
  @Delete(':id/permanent')
  @Roles(AdminRole.OWNER)
  removePermanent(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.removePermanent(id);
  }
}
