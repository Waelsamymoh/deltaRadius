import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { RadiusUsersService } from '../radius-users/radius-users.service';

/** Self-service portal: subscribers log in with their MOBILE + a portal
 *  password set by the manager. Tokens are scoped to a single subscriber. */
@Injectable()
export class SubscriberPortalService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    private readonly jwt: JwtService,
    private readonly radiusUsers: RadiusUsersService,
  ) {}

  async login(mobile: string, password: string, tenantId: number | null) {
    if (tenantId === null) throw new BadRequestException('رابط العميل غير صحيح');
    const m = (mobile ?? '').trim();
    const p = (password ?? '').trim();
    if (!m || !p) throw new BadRequestException('أدخل رقم الموبايل وكلمة المرور');

    const profile = await this.profileRepo.findOne({
      where: { mobile: m, tenantId, isArchived: false },
    });
    if (!profile || !profile.portalPasswordHash) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    const ok = await bcrypt.compare(p, profile.portalPasswordHash);
    if (!ok) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    const token = this.jwt.sign({
      typ: 'subscriber',
      username: profile.username,
      tenantId,
    });
    return {
      access_token: token,
      subscriber: { username: profile.username, firstName: profile.firstName, mobile: profile.mobile },
    };
  }

  /** Reuse the admin stats path with a synthetic tenant-scoped identity. */
  async myStats(username: string, tenantId: number) {
    const synthetic = { role: AdminRole.SUPERADMIN, tenantId } as AdminUser;
    return this.radiusUsers.getStats(username, synthetic, tenantId);
  }
}
