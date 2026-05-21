import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SstpService } from './sstp.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../database/entities/admin-user.entity';

@Controller('sstp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.OWNER)
export class SstpController {
  constructor(private readonly service: SstpService) {}

  // ── chap-secrets user management ──────────────────────────────────────────

  @Get('users')
  listUsers() { return this.service.listUsers(); }

  @Post('users')
  createUser(@Body() body: { username: string; password: string; ip?: string }) {
    return this.service.createUser(body.username, body.password, body.ip);
  }

  @Patch('users/:username')
  updateUser(@Param('username') username: string, @Body() body: { password: string }) {
    return this.service.updateUser(username, body.password);
  }

  @Delete('users/:username')
  deleteUser(@Param('username') username: string) {
    return this.service.deleteUser(username);
  }

  // ── runtime monitoring ─────────────────────────────────────────────────────

  @Get('status')
  getStatus() { return this.service.getStatus(); }

  @Get('stat')
  getStat() { return this.service.getStat(); }

  @Get('sessions')
  getSessions() { return this.service.getSessions(); }

  @Post('terminate/:username')
  terminate(@Param('username') username: string) {
    return this.service.terminateSession(username);
  }

  // ── config ─────────────────────────────────────────────────────────────────

  @Get('config')
  getConfig() { return this.service.getConfig(); }

  @Post('config')
  updateConfig(@Body() body: { ipPool?: string; dns1?: string; dns2?: string; gwIp?: string }) {
    return this.service.updateConfig(body);
  }

  @Get('cert')
  getCert() { return this.service.getCert(); }

  @Post('restart')
  restart() { return this.service.restart(); }
}
