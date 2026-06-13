import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, ParseIntPipe, Query } from '@nestjs/common';
import { TopupsService } from './topups.service';
import { CreateTopupPackageDto, UpdateTopupPackageDto, ApplyTopupDto } from './dto/topup-package.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class TopupsController {
  constructor(private readonly svc: TopupsService) {}

  // ── Packages (managing the catalog) — requires `topups.manage` ──
  @Get('topup-packages')
  @RequirePermissions('topups.manage')
  listPackages(@Req() req: any, @Query('tenantId') tenantId?: string) {
    return this.svc.listPackages(req.user, tenantId ? +tenantId : undefined);
  }

  @Get('topup-packages/:id')
  @RequirePermissions('topups.manage')
  getPackage(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.getPackage(id, req.user);
  }

  @Post('topup-packages')
  @RequirePermissions('topups.manage')
  createPackage(
    @Body() dto: CreateTopupPackageDto,
    @Req() req: any,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.createPackage(dto, req.user, tenantId ? +tenantId : undefined);
  }

  @Patch('topup-packages/:id')
  @RequirePermissions('topups.manage')
  updatePackage(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTopupPackageDto, @Req() req: any) {
    return this.svc.updatePackage(id, dto, req.user);
  }

  @Delete('topup-packages/:id')
  @RequirePermissions('topups.manage')
  removePackage(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.deletePackage(id, req.user);
  }

  // ── Apply to user / view history — requires `users.topup` ──
  @Post('radius-users/:username/topup')
  @RequirePermissions('users.topup')
  applyTopup(@Param('username') username: string, @Body() dto: ApplyTopupDto, @Req() req: any) {
    return this.svc.applyToUser(username, dto.packageId, req.user);
  }

  @Get('radius-users/:username/topups')
  @RequirePermissions('users.view_detail')
  userTopups(@Param('username') username: string, @Req() req: any) {
    return this.svc.getUserTopups(username, req.user);
  }

  @Delete('radius-users/:username/bonus')
  @RequirePermissions('users.topup')
  clearUserBonus(@Param('username') username: string, @Req() req: any) {
    return this.svc.clearUserBonus(username, req.user);
  }

  @Delete('radius-users/:username/topups/:topupId')
  @RequirePermissions('users.topup')
  clearOneTopup(
    @Param('username') username: string,
    @Param('topupId', ParseIntPipe) topupId: number,
    @Req() req: any,
  ) {
    return this.svc.clearOneTopup(username, topupId, req.user);
  }
}
