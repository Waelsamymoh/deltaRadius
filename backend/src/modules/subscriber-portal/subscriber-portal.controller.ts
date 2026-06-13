import { Controller, Post, Get, Body, Req, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SubscriberPortalService } from './subscriber-portal.service';

/** All routes are PUBLIC (no admin JwtAuthGuard). `/login` is open; `/me`
 *  validates a subscriber token manually so it never collides with admin auth. */
@Controller('subscriber-portal')
export class SubscriberPortalController {
  constructor(
    private readonly svc: SubscriberPortalService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  login(
    @Body() dto: { mobile: string; password: string },
    @Req() req: any,
  ) {
    return this.svc.login(dto.mobile, dto.password, req.resolvedTenantId ?? null);
  }

  @Get('me')
  async me(@Req() req: any) {
    const auth = (req.headers['authorization'] as string) ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) throw new UnauthorizedException();
    let payload: any;
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_SECRET') || 'change_me_in_production',
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (payload?.typ !== 'subscriber' || !payload.username || payload.tenantId == null) {
      throw new UnauthorizedException();
    }
    // The token's tenant must match the subdomain it's used on.
    if (req.resolvedTenantId != null && req.resolvedTenantId !== payload.tenantId) {
      throw new UnauthorizedException();
    }
    return this.svc.myStats(payload.username, payload.tenantId);
  }
}
