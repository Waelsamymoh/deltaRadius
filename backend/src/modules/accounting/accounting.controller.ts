import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

@Controller('accounting')
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('sessions')
  sessions(
    @CurrentUser() user: AdminUser,
    @Query('active') active?: string,
  ) {
    const onlyActive = active === 'true' ? true : active === 'false' ? false : undefined;
    return this.accountingService.findSessions(user, onlyActive);
  }

  @Get('auth-logs')
  authLogs(@CurrentUser() user: AdminUser) {
    return this.accountingService.findAuthLogs(user);
  }

  @Get('stats')
  stats(@CurrentUser() user: AdminUser) {
    return this.accountingService.stats(user);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AdminUser) {
    return this.accountingService.dashboardStats(user);
  }
}
