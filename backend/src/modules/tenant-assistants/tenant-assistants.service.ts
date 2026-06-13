import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { CreateTenantAssistantDto } from './dto/create-tenant-assistant.dto';
import { UpdateTenantAssistantDto } from './dto/update-tenant-assistant.dto';
import { TENANT_PERMISSION_KEYS } from '../../common/decorators/permissions.decorator';
import { getScopedTenantId } from '../../common/helpers/tenant.helper';

@Injectable()
export class TenantAssistantsService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepo: Repository<AdminUser>,
  ) {}

  private sanitize(user: AdminUser) {
    const { passwordHash: _, ...safe } = user as AdminUser & { passwordHash: string };
    return safe;
  }

  private validatePermissions(perms: string[] | undefined): string[] {
    if (!perms) return [];
    const allowed = new Set<string>(TENANT_PERMISSION_KEYS as readonly string[]);
    const invalid = perms.filter(p => !allowed.has(p));
    if (invalid.length) {
      throw new BadRequestException(`صلاحيات غير معروفة: ${invalid.join(', ')}`);
    }
    return Array.from(new Set(perms));
  }

  /** Resolve the tenant scope from the caller. Tenant admins are pinned to
   *  their own tenant; owner-side callers must pass overrideTenantId. */
  private scopeOrThrow(user: AdminUser, overrideTenantId?: number): number {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) {
      throw new BadRequestException('يجب تحديد العميل (tenant)');
    }
    return tenantId;
  }

  async findAll(user: AdminUser, overrideTenantId?: number) {
    const tenantId = this.scopeOrThrow(user, overrideTenantId);
    const rows = await this.adminUserRepo.find({
      where: { role: AdminRole.TENANT_ASSISTANT, tenantId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(r => this.sanitize(r));
  }

  async create(dto: CreateTenantAssistantDto, user: AdminUser, overrideTenantId?: number) {
    const tenantId = this.scopeOrThrow(user, overrideTenantId);
    const exists = await this.adminUserRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const assistant = this.adminUserRepo.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: AdminRole.TENANT_ASSISTANT,
      tenantId,
      permissions: this.validatePermissions(dto.permissions),
      isActive: true,
    });
    const saved = await this.adminUserRepo.save(assistant);
    return this.sanitize(saved);
  }

  async update(id: number, dto: UpdateTenantAssistantDto, user: AdminUser, overrideTenantId?: number) {
    const tenantId = this.scopeOrThrow(user, overrideTenantId);
    const assistant = await this.adminUserRepo.findOne({ where: { id } });
    if (!assistant || assistant.role !== AdminRole.TENANT_ASSISTANT) {
      throw new NotFoundException('المشرف غير موجود');
    }
    // Tenant admins can only edit their own tenant's assistants
    if (assistant.tenantId !== tenantId) {
      throw new ForbiddenException('غير مسموح بتعديل مشرف من عميل آخر');
    }
    if (dto.email && dto.email !== assistant.email) {
      const taken = await this.adminUserRepo.findOne({ where: { email: dto.email } });
      if (taken) throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');
      assistant.email = dto.email;
    }
    if (dto.fullName !== undefined)    assistant.fullName    = dto.fullName;
    if (dto.permissions !== undefined) assistant.permissions = this.validatePermissions(dto.permissions);
    if (dto.isActive !== undefined)    assistant.isActive    = dto.isActive;
    if (dto.password)                  assistant.passwordHash = await bcrypt.hash(dto.password, 12);
    const saved = await this.adminUserRepo.save(assistant);
    return this.sanitize(saved);
  }

  async remove(id: number, user: AdminUser, overrideTenantId?: number) {
    const tenantId = this.scopeOrThrow(user, overrideTenantId);
    const assistant = await this.adminUserRepo.findOne({ where: { id } });
    if (!assistant || assistant.role !== AdminRole.TENANT_ASSISTANT) {
      throw new NotFoundException('المشرف غير موجود');
    }
    if (assistant.tenantId !== tenantId) {
      throw new ForbiddenException('غير مسموح بحذف مشرف من عميل آخر');
    }
    await this.adminUserRepo.remove(assistant);
    return { message: 'تم حذف المشرف' };
  }

  /** Static list of permission keys the UI renders as checkboxes. */
  listAvailablePermissions() {
    const labels: Record<string, string> = {
      'nas.manage':        'إدارة أجهزة NAS',
      // Subscribers — granular controls (UI groups by `users.*` prefix)
      'users.manage':      'عرض قائمة المشتركين',
      'users.sales':       'عرض صفحة المبيعات',
      'users.create':      'إضافة مشتركين جدد',
      'users.edit':        'تعديل بيانات المشتركين',
      'users.renew':       'تجديد اشتراك المشتركين',
      'users.delete':      'أرشفة وحذف المشتركين',
      'users.suspend':     'إيقاف وتشغيل المشتركين',
      'users.topup':       'تطبيق باقات الكوتة',
      'users.view_detail': 'فتح لوحة المشترك',
      'users.hide_list':   'إخفاء القائمة (يظهرون عبر البحث فقط)',
      // Other resources
      'plans.view':        'اختيار خطة الإنترنت أثناء التجديد (بدون صفحة الإدارة)',
      'plans.manage':      'إدارة خطط الإنترنت',
      'topups.manage':     'إدارة باقات الكوتة',
      'cards.manage':      'إدارة كروت الإنترنت',
      'accounting.view':   'عرض المحاسبة والإحصائيات',
    };
    return TENANT_PERMISSION_KEYS.map(key => ({ key, label: labels[key] ?? key }));
  }
}
