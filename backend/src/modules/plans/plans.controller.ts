import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, ParseIntPipe, UseGuards, Query,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

@Controller('plans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  // Read endpoints accept the lightweight `plans.view` permission too, so a
  // sales supervisor can populate the renewal dropdown without getting access
  // to the full plans management page.
  @Get()
  @RequirePermissions('plans.manage', 'plans.view')
  findAll(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.plansService.findAll(user, tenantId ? +tenantId : undefined);
  }

  @Get(':id')
  @RequirePermissions('plans.manage', 'plans.view')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.plansService.findOne(id, user);
  }

  @Post()
  @RequirePermissions('plans.manage')
  create(
    @Body() dto: CreatePlanDto,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.plansService.create(dto, user, tenantId ? +tenantId : undefined);
  }

  @Patch(':id')
  @RequirePermissions('plans.manage')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: AdminUser,
  ) {
    return this.plansService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('plans.manage')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.plansService.remove(id, user);
  }
}
