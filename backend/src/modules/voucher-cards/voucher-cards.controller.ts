import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { VoucherCardsService } from './voucher-cards.service';
import { GenerateCardsDto } from './dto/generate-cards.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('cards.manage')
@Controller('voucher-cards')
export class VoucherCardsController {
  constructor(private readonly svc: VoucherCardsService) {}

  @Post('generate')
  generate(
    @Body() dto: GenerateCardsDto,
    @Req() req: any,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.generate(dto, req.user, tenantId ? +tenantId : undefined);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('planId') planId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.findAll(req.user, {
      status,
      search,
      planId: planId ? Number(planId) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      overrideTenantId: tenantId ? Number(tenantId) : undefined,
    });
  }

  @Get('batches')
  getBatches(@Req() req: any, @Query('tenantId') tenantId?: string) {
    return this.svc.getBatches(req.user, tenantId ? +tenantId : undefined);
  }

  @Get('batch/:name/cards')
  getBatchCards(@Param('name') name: string, @Req() req: any, @Query('tenantId') tenantId?: string) {
    return this.svc.getBatchCards(name, req.user, tenantId ? +tenantId : undefined);
  }

  @Delete('batch/:name')
  removeBatch(@Param('name') name: string, @Req() req: any, @Query('tenantId') tenantId?: string) {
    return this.svc.removeBatch(name, req.user, tenantId ? +tenantId : undefined);
  }

  @Delete('range/delete')
  removeByRange(
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: any,
    @Query('tenantId') tenantId?: string,
  ) {
    if (!from || !to) throw new BadRequestException('from and to are required');
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    return this.svc.removeByDateRange(fromDate, toDate, req.user, tenantId ? +tenantId : undefined);
  }

  @Post('range/disable')
  disableByRange(
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: any,
    @Query('tenantId') tenantId?: string,
  ) {
    if (!from || !to) throw new BadRequestException('from and to are required');
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    return this.svc.disableByDateRange(fromDate, toDate, req.user, tenantId ? +tenantId : undefined);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCardDto, @Req() req: any) {
    return this.svc.update(id, dto, req.user);
  }

  @Post(':id/disable')
  disable(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.disable(id, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.remove(id, req.user);
  }
}
