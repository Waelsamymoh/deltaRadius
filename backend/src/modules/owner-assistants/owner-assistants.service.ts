import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { CreateOwnerAssistantDto } from './dto/create-owner-assistant.dto';
import { UpdateOwnerAssistantDto } from './dto/update-owner-assistant.dto';
import { OWNER_PERMISSION_KEYS } from '../../common/decorators/permissions.decorator';

@Injectable()
export class OwnerAssistantsService {
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
    const allowed = new Set<string>(OWNER_PERMISSION_KEYS as readonly string[]);
    const invalid = perms.filter(p => !allowed.has(p));
    if (invalid.length) {
      throw new BadRequestException(`صلاحيات غير معروفة: ${invalid.join(', ')}`);
    }
    return Array.from(new Set(perms));
  }

  async findAll() {
    const rows = await this.adminUserRepo.find({
      where: { role: AdminRole.OWNER_ASSISTANT },
      order: { createdAt: 'DESC' },
    });
    return rows.map(r => this.sanitize(r));
  }

  async create(dto: CreateOwnerAssistantDto) {
    const exists = await this.adminUserRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.adminUserRepo.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: AdminRole.OWNER_ASSISTANT,
      tenantId: null,
      permissions: this.validatePermissions(dto.permissions),
      isActive: true,
    });
    const saved = await this.adminUserRepo.save(user);
    return this.sanitize(saved);
  }

  async update(id: number, dto: UpdateOwnerAssistantDto) {
    const user = await this.adminUserRepo.findOne({ where: { id } });
    if (!user || user.role !== AdminRole.OWNER_ASSISTANT) {
      throw new NotFoundException('المساعد غير موجود');
    }
    if (dto.email && dto.email !== user.email) {
      const taken = await this.adminUserRepo.findOne({ where: { email: dto.email } });
      if (taken) throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');
      user.email = dto.email;
    }
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.permissions !== undefined) user.permissions = this.validatePermissions(dto.permissions);
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 12);
    }
    const saved = await this.adminUserRepo.save(user);
    return this.sanitize(saved);
  }

  async remove(id: number) {
    const user = await this.adminUserRepo.findOne({ where: { id } });
    if (!user || user.role !== AdminRole.OWNER_ASSISTANT) {
      throw new NotFoundException('المساعد غير موجود');
    }
    await this.adminUserRepo.remove(user);
    return { message: 'تم حذف المساعد' };
  }

  /** Static list of permission keys the UI can render as checkboxes. */
  listAvailablePermissions() {
    const labels: Record<string, string> = {
      'tenants.manage':    'إدارة العملاء (الشبكات)',
      'nas.manage':        'إدارة أجهزة NAS',
      'users.manage':      'إدارة المشتركين',
      'plans.manage':      'إدارة خطط الإنترنت',
      'topups.manage':     'إدارة باقات الكوتة',
      'cards.manage':      'إدارة كروت الإنترنت',
      'accounting.view':   'عرض المحاسبة والإحصائيات',
      'sstp.manage':       'إدارة سيرفر SSTP',
    };
    return OWNER_PERMISSION_KEYS.map(key => ({ key, label: labels[key] ?? key }));
  }
}
