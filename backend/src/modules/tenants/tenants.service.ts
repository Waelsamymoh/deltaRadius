import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from '../../database/entities/tenant.entity';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AdminUser)
    private readonly adminUserRepo: Repository<AdminUser>,
  ) {}

  async findAll() {
    return this.tenantRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: number) {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async create(dto: CreateTenantDto) {
    const exists = await this.tenantRepo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Tenant name already exists');
    const tenant = this.tenantRepo.create(dto);
    return this.tenantRepo.save(tenant);
  }

  async update(id: number, dto: UpdateTenantDto) {
    const tenant = await this.findOne(id);
    Object.assign(tenant, dto);
    return this.tenantRepo.save(tenant);
  }

  async resetAdminPassword(tenantId: number, newPassword: string) {
    if (!newPassword || newPassword.length < 6)
      throw new BadRequestException('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    const admin = await this.adminUserRepo.findOne({
      where: { tenantId, role: AdminRole.SUPERADMIN },
      order: { id: 'ASC' },
    });
    if (!admin) throw new NotFoundException('لا يوجد مدير لهذا العميل');
    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.adminUserRepo.save(admin);
    return { message: 'تم تغيير كلمة المرور بنجاح', adminEmail: admin.email };
  }

  async remove(id: number) {
    const tenant = await this.findOne(id);
    await this.tenantRepo.remove(tenant);
    return { message: `Tenant ${id} deleted` };
  }
}
