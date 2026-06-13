import {
  Injectable, UnauthorizedException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { Tenant } from '../../database/entities/tenant.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SelfRegisterDto, RESERVED } from './dto/self-register.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepo: Repository<AdminUser>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly tenantsService: TenantsService,
  ) {}

  async login(dto: LoginDto, resolvedTenantId?: number | null) {
    const user = await this.adminUserRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    // Subdomain validation:
    // - If a tenant subdomain was resolved, the user must belong to that tenant
    // - Owner & owner-assistant accounts log in only from main domain (no subdomain)
    if (resolvedTenantId !== null && resolvedTenantId !== undefined) {
      if (user.role === AdminRole.OWNER || user.role === AdminRole.OWNER_ASSISTANT) {
        throw new UnauthorizedException('حسابات الإدارة لا تسجل دخول من رابط العميل');
      }
      if (user.tenantId !== resolvedTenantId) throw new UnauthorizedException('هذا الحساب لا ينتمي لهذا الرابط');
    } else {
      // Main domain / no subdomain: only owner-side accounts can log in
      if (user.role !== AdminRole.OWNER && user.role !== AdminRole.OWNER_ASSISTANT) {
        throw new UnauthorizedException('سجّل الدخول من رابط شبكتك');
      }
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
      role: AdminRole.OWNER,
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

  async selfRegister(dto: SelfRegisterDto) {
    if (RESERVED.includes(dto.subdomain.toLowerCase()))
      throw new BadRequestException('هذا الـ subdomain محجوز');

    const subExists = await this.tenantRepo.findOne({ where: { subdomain: dto.subdomain } });
    if (subExists) throw new ConflictException('الـ subdomain مستخدم بالفعل، اختر رابطاً آخر');

    const nameExists = await this.tenantRepo.findOne({ where: { name: dto.networkName } });
    if (nameExists) throw new ConflictException('اسم الشبكة مستخدم بالفعل، اختر اسماً آخر');

    const emailExists = await this.adminUserRepo.findOne({ where: { email: dto.email } });
    if (emailExists) throw new ConflictException('اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل');

    const phoneExists = await this.tenantRepo.findOne({ where: { contactPhone: dto.phone } });
    if (phoneExists) throw new ConflictException('رقم الموبايل مستخدم بالفعل');

    // Create tenant ONLY — no SSTP user is auto-created. The tenant or owner
    // will add SSTP devices manually from the "إضافة أجهزة" panel later.
    let tenant;
    try {
      // No auto-generated SSTP/NAS for new tenants — they add their own NAS
      // devices later from the "أجهزة الشبكة" page (each device gets its own
      // SSTP user + static IP via the standard NAS-create flow).
      tenant = await this.tenantsService.create({
        name: dto.networkName,
        subdomain: dto.subdomain.toLowerCase(),
        businessName: dto.businessName ?? dto.networkName,
        contactPhone: dto.phone,
      });
    } catch (e: any) {
      if (e?.driverError?.code === '23505') {
        const c = e?.driverError?.constraint ?? '';
        if (c.includes('subdomain'))     throw new ConflictException('الـ subdomain مستخدم بالفعل، اختر رابطاً آخر');
        if (c.includes('contact_phone')) throw new ConflictException('رقم الموبايل مستخدم بالفعل');
        throw new ConflictException('اسم الشبكة مستخدم بالفعل، اختر اسماً آخر');
      }
      throw e;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.adminUserRepo.create({
      email: dto.email,
      passwordHash,
      fullName: dto.businessName ?? dto.networkName,
      role: AdminRole.SUPERADMIN,
      tenantId: tenant.id,
    });
    await this.adminUserRepo.save(user);

    return {
      subdomain: tenant.subdomain,
      access_token: this.sign(user),
      user: this.sanitize(user),
    };
  }

  /**
   * Apex-domain login: authenticate by email/password regardless of subdomain,
   * then return the correct subdomain ("admin" for owner/assistant, the tenant's
   * own subdomain otherwise) so the frontend can redirect + auto-login.
   */
  async loginFromLanding(dto: LoginDto) {
    const user = await this.adminUserRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    let subdomain: string;
    if (user.role === AdminRole.OWNER || user.role === AdminRole.OWNER_ASSISTANT) {
      subdomain = 'admin';
    } else {
      if (!user.tenantId) throw new UnauthorizedException('حسابك غير مرتبط بأي شبكة');
      const tenant = await this.tenantRepo.findOne({ where: { id: user.tenantId } });
      if (!tenant)             throw new UnauthorizedException('الشبكة غير موجودة');
      if (tenant.isArchived)   throw new UnauthorizedException('هذه الشبكة مؤرشفة');
      if (!tenant.subdomain)   throw new UnauthorizedException('الشبكة لا تملك رابطاً مخصصاً');
      subdomain = tenant.subdomain;
    }

    return {
      subdomain,
      access_token: this.sign(user),
      user: this.sanitize(user),
    };
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
