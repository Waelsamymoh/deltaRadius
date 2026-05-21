import { Controller, Get, UseGuards } from '@nestjs/common';
import { ServerHealthService } from './server-health.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../database/entities/admin-user.entity';

@Controller('server-health')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.OWNER, AdminRole.OWNER_ASSISTANT)
export class ServerHealthController {
  constructor(private readonly svc: ServerHealthService) {}

  @Get()
  getHealth() {
    return this.svc.getHealth();
  }
}
