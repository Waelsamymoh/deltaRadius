import {
  Controller, Get, Post, Patch, Put, Delete,
  Param, Body, ParseIntPipe, UseGuards, Query,
} from '@nestjs/common';
import { ModemsService, MikrotikAddress } from './modems.service';
import { CreateModemDto } from './dto/create-modem.dto';
import { UpdateModemDto } from './dto/update-modem.dto';
import { IsString, IsOptional, IsArray } from 'class-validator';

class MikrotikFetchDto {
  @IsString() ip: string;
  @IsString() username: string;
  @IsString() password: string;
}

class MikrotikImportDto {
  @IsString() ip: string;
  @IsString() username: string;
  @IsString() password: string;
  @IsArray() entries: MikrotikAddress[];
  @IsOptional() nasId?: number;
}
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

@Controller('modems')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('modems.manage')
export class ModemsController {
  constructor(private readonly modemsService: ModemsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.modemsService.findAll(user, tenantId ? +tenantId : undefined);
  }

  /** Yearly consumption totals (optionally one network). */
  @Get('reports/yearly')
  yearly(
    @CurrentUser() user: AdminUser,
    @Query('years') years?: string,
    @Query('tenantId') tenantId?: string,
    @Query('nasId') nasId?: string,
  ) {
    return this.modemsService.getYearlyReport(user, years ? +years : 5, tenantId ? +tenantId : undefined, nasId ? +nasId : undefined);
  }

  /** Monthly consumption totals for a given year (optionally one network). */
  @Get('reports/monthly')
  monthlyReport(
    @CurrentUser() user: AdminUser,
    @Query('year') year?: string,
    @Query('tenantId') tenantId?: string,
    @Query('nasId') nasId?: string,
  ) {
    return this.modemsService.getMonthlyReport(user, year ? +year : new Date().getFullYear(), tenantId ? +tenantId : undefined, nasId ? +nasId : undefined);
  }

  /** Daily consumption totals for a given month (optionally one network). */
  @Get('reports/daily')
  dailyReport(
    @CurrentUser() user: AdminUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('tenantId') tenantId?: string,
    @Query('nasId') nasId?: string,
  ) {
    return this.modemsService.getDailyReport(
      user,
      year ? +year : new Date().getFullYear(),
      month ? +month : new Date().getMonth() + 1,
      tenantId ? +tenantId : undefined,
      nasId ? +nasId : undefined,
    );
  }

  /** Per-router breakdown for one specific day (optionally one network). */
  @Get('reports/daily/routers')
  dailyRouters(
    @CurrentUser() user: AdminUser,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('day') day: string,
    @Query('tenantId') tenantId?: string,
    @Query('nasId') nasId?: string,
  ) {
    return this.modemsService.getDailyRouters(user, +year, +month, +day, tenantId ? +tenantId : undefined, nasId ? +nasId : undefined);
  }

  /** Enable/disable a modem's interface on the MikroTik. */
  @Post(':id/set-enabled')
  setEnabled(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { enabled: boolean },
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.modemsService.setEnabled(id, !!dto.enabled, user, tenantId ? +tenantId : undefined);
  }

  /** Daily auto-reset toggle (per tenant). */
  @Get('auto-reset')
  getAutoReset(@CurrentUser() user: AdminUser, @Query('tenantId') tenantId?: string) {
    return this.modemsService.getAutoResetFor(user, tenantId ? +tenantId : undefined);
  }

  @Put('auto-reset')
  setAutoReset(
    @Body() dto: { enabled: boolean },
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.modemsService.setAutoResetFor(user, !!dto.enabled, tenantId ? +tenantId : undefined);
  }

  /** Live stats (status + GB) — polled by the UI every 30s. */
  @Get('live')
  live(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.modemsService.getLiveStats(user, tenantId ? +tenantId : undefined);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.modemsService.findOne(id, user);
  }

  @Post()
  create(
    @Body() dto: CreateModemDto,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.modemsService.create(dto, user, tenantId ? +tenantId : undefined);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateModemDto,
    @CurrentUser() user: AdminUser,
  ) {
    return this.modemsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.modemsService.remove(id, user);
  }

  /** Fetch /ip/address from a MikroTik RouterOS 7 device (preview, no DB write). */
  @Post('mikrotik/fetch')
  fetchMikrotik(@Body() dto: MikrotikFetchDto) {
    return this.modemsService.fetchMikrotikAddresses(dto.ip, dto.username, dto.password);
  }

  /** Reset traffic counters (consumption) for the given modems on the MikroTik. */
  @Post('reset-counters')
  resetCounters(
    @Body() dto: { modemIds: number[] },
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.modemsService.resetCounters(dto.modemIds ?? [], user, tenantId ? +tenantId : undefined);
  }

  /** Sync modem statuses with current MikroTik interface running states. */
  @Post('mikrotik/sync')
  syncMikrotik(
    @Body() dto: MikrotikFetchDto,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.modemsService.syncFromMikrotik(dto.ip, dto.username, dto.password, user, tenantId ? +tenantId : undefined);
  }

  /** Import selected MikroTik address entries as modem records. */
  @Post('mikrotik/import')
  importMikrotik(
    @Body() dto: MikrotikImportDto,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.modemsService.importFromMikrotik(dto.entries, user, tenantId ? +tenantId : undefined, dto.nasId);
  }
}
