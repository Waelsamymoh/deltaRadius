import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, ParseIntPipe, UseGuards, Res, Req, Query,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { NasService } from './nas.service';
import { CreateNasDto } from './dto/create-nas.dto';
import { UpdateNasDto } from './dto/update-nas.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

/**
 * Public, no-auth endpoint so MikroTik's /tool fetch can grab the script.
 * Authorization is enforced via a per-NAS HMAC token in the query string —
 * the token rotates automatically whenever the SSTP password is regenerated.
 */
@Controller('public/nas')
export class PublicNasController {
  constructor(private readonly nasService: NasService) {}

  // Token lives in the path (not query string) — MikroTik's /tool fetch strips
  // the "?" from URLs, so query-based tokens never reach us.
  @Get(':id/:token/script.rsc')
  async publicScript(
    @Param('id', ParseIntPipe) id: number,
    @Param('token') token: string,
    @Res() res: Response,
    @Query('ros') ros?: string,
  ) {
    const nas = await this.nasService.findByIdWithToken(id, token);
    const script = await this.nasService.buildMikrotikScript(nas, ros ? +ros : 6);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(script);
  }
}

@Controller('nas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('nas.manage')
export class NasController {
  constructor(private readonly nasService: NasService) {}

  @Get()
  findAll(
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.nasService.findAll(user, tenantId ? +tenantId : undefined);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.nasService.findOne(id, user);
  }

  @Post()
  create(
    @Body() dto: CreateNasDto,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.nasService.create(dto, user, tenantId ? +tenantId : undefined);
  }

  @Get(':id/check')
  checkRadius(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.nasService.checkRadius(id, user);
  }

  @Get(':id/mikrotik-script')
  async mikrotikScript(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AdminUser,
    @Res() res: Response,
    @Query('ros') ros?: string,
  ) {
    const nas = await this.nasService.findOne(id, user);
    const v = ros ? +ros : 6;
    const script = await this.nasService.buildMikrotikScript(nas, v);
    const slug = (nas.shortname || nas.nasname || `nas-${id}`).replace(/[^a-z0-9._-]/gi, '-');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mikrotik-${slug}${v >= 7 ? '-ros7' : ''}.rsc"`);
    res.send(script);
  }

  @Get(':id/fetch-command')
  async fetchCommand(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AdminUser,
    @Req() req: Request,
    @Query('ros') ros?: string,
  ) {
    const nas = await this.nasService.findOne(id, user);
    const script = await this.nasService.buildMikrotikScript(nas, ros ? +ros : 6);
    // Prefer the proxied scheme/host so the URL matches whatever the user is on
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const host  = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
    const baseUrl = `${proto}://${host}`;
    const { url, command } = this.nasService.buildFetchCommand(nas, baseUrl);
    return { url, command, script };
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNasDto,
    @CurrentUser() user: AdminUser,
  ) {
    return this.nasService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.nasService.remove(id, user);
  }
}
