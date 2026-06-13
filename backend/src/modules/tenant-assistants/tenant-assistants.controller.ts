import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, ParseIntPipe, UseGuards, Query,
} from '@nestjs/common';
import { TenantAssistantsService } from './tenant-assistants.service';
import { CreateTenantAssistantDto } from './dto/create-tenant-assistant.dto';
import { UpdateTenantAssistantDto } from './dto/update-tenant-assistant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';

/** Per-tenant supervisor accounts. Only the tenant's own SUPERADMIN can manage
 *  these; the owner can also manage them via tenantId override. */
@Controller('tenant-assistants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.OWNER, AdminRole.SUPERADMIN)
export class TenantAssistantsController {
  constructor(private readonly service: TenantAssistantsService) {}

  @Get('permissions')
  listPermissions() {
    return this.service.listAvailablePermissions();
  }

  @Get()
  findAll(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.service.findAll(user, tenantId ? +tenantId : undefined);
  }

  @Post()
  create(
    @Body() dto: CreateTenantAssistantDto,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.service.create(dto, user, tenantId ? +tenantId : undefined);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTenantAssistantDto,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.service.update(id, dto, user, tenantId ? +tenantId : undefined);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.service.remove(id, user, tenantId ? +tenantId : undefined);
  }
}
