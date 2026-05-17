import {
  Injectable, UnauthorizedException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepo: Repository<AdminUser>,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto, resolvedTenantId?: number | null) {
    const user = await this.adminUserRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    // Subdomain validation:
    // - If a tenant subdomain was resolved, the user must belong to that tenant
    // - Owner accounts can log in from any context (resolvedTenantId = null)
    if (resolvedTenantId !== null && resolvedTenantId !== undefined) {
      if (user.role === AdminRole.OWNER) throw new UnauthorizedException('حساب المالك لا يسجل دخول من رابط العميل');
      if (user.tenantId !== resolvedTenantId) throw new UnauthorizedException('هذا الحساب لا ينتمي لهذا الرابط');
    } else {
      // Main domain / no subdomain: only owner accounts can log in
      if (user.role !== AdminRole.OWNER) throw new UnauthorizedException('سجّل الدخول من رابط شبكتك');
    }

    return { access_token: this.sign(user), user: this.sanitize(user) };
  }

  async register(dto: RegisterDto) {
    const exists = await this.adminUserRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.adminUserRepo.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: dto.role ?? AdminRole.ADMIN,
      tenantId: dto.tenantId ?? null,
    });
    await this.adminUserRepo.save(user);
    return { access_token: this.sign(user), user: this.sanitize(user) };
  }

  async setupStatus() {
    const count = await this.adminUserRepo.count();
    return { needsSetup: count === 0 };
  }

  async setupFirstAdmin(dto: RegisterDto) {
    const count = await this.adminUserRepo.count();
    if (count > 0) throw new ConflictException('Setup already completed');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.adminUserRepo.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: AdminRole.SUPERADMIN,
      tenantId: null,
    });
    await this.adminUserRepo.save(user);
    return { access_token: this.sign(user), user: this.sanitize(user) };
  }

  async profile(userId: number) {
    const user = await this.adminUserRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.sanitize(user);
  }

  async updateProfile(userId: number, dto: { fullName?: string; email?: string; currentPassword?: string; newPassword?: string }) {
    const user = await this.adminUserRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if (dto.fullName !== undefined) user.fullName = dto.fullName;

    if (dto.email && dto.email !== user.email) {
      const taken = await this.adminUserRepo.findOne({ where: { email: dto.email } });
      if (taken) throw new ConflictException('اسم الدخول مستخدم بالفعل');
      user.email = dto.email;
    }

    if (dto.newPassword) {
      if (!dto.currentPassword) throw new BadRequestException('أدخل كلمة المرور الحالية');
      const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!valid) throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
      user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    }

    const saved = await this.adminUserRepo.save(user);
    const sanitized = this.sanitize(saved);
    return { user: sanitized, access_token: this.sign(saved) };
  }

  private sign(user: AdminUser): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId ?? null,
    };
    return this.jwtService.sign(payload);
  }

  private sanitize(user: AdminUser) {
    const { passwordHash: _, ...safe } = user as AdminUser & { passwordHash: string };
    return safe;
  }
}
