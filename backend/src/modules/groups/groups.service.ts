import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, FindOptionsWhere } from 'typeorm';
import { RadGroupCheck } from '../../database/entities/radgroupcheck.entity';
import { RadGroupReply } from '../../database/entities/radgroupreply.entity';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { getTenantId } from '../../common/helpers/tenant.helper';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(RadGroupCheck)
    private readonly groupCheckRepo: Repository<RadGroupCheck>,
    @InjectRepository(RadGroupReply)
    private readonly groupReplyRepo: Repository<RadGroupReply>,
    private readonly dataSource: DataSource,
  ) {}

  private w<T>(tenantId: number | null, extra: Partial<T> = {}): FindOptionsWhere<T> {
    return (tenantId ? { tenantId, ...extra } : extra) as FindOptionsWhere<T>;
  }

  async findAll(user: AdminUser) {
    const tenantId = getTenantId(user);
    const checks  = await this.groupCheckRepo.find({ where: this.w(tenantId) });
    const replies = await this.groupReplyRepo.find({ where: this.w(tenantId) });

    const grouped: Record<string, { checkAttributes: RadGroupCheck[]; replyAttributes: RadGroupReply[] }> = {};
    for (const c of checks) {
      grouped[c.groupName] ??= { checkAttributes: [], replyAttributes: [] };
      grouped[c.groupName].checkAttributes.push(c);
    }
    for (const r of replies) {
      grouped[r.groupName] ??= { checkAttributes: [], replyAttributes: [] };
      grouped[r.groupName].replyAttributes.push(r);
    }
    return Object.entries(grouped).map(([groupName, data]) => ({ groupName, ...data }));
  }

  async findOne(groupName: string, user: AdminUser) {
    const tenantId = getTenantId(user);
    const checks  = await this.groupCheckRepo.find({ where: this.w<RadGroupCheck>(tenantId, { groupName }) });
    const replies = await this.groupReplyRepo.find({ where: this.w<RadGroupReply>(tenantId, { groupName }) });
    if (!checks.length && !replies.length) throw new NotFoundException(`Group '${groupName}' not found`);
    return { groupName, checkAttributes: checks, replyAttributes: replies };
  }

  async create(dto: CreateGroupDto, user: AdminUser) {
    const tenantId = getTenantId(user);
    await this.dataSource.transaction(async (manager) => {
      for (const c of dto.checks ?? []) {
        await manager.save(RadGroupCheck, { ...c, groupName: dto.groupName, tenantId });
      }
      for (const r of dto.replies ?? []) {
        await manager.save(RadGroupReply, { ...r, groupName: dto.groupName, tenantId });
      }
    });
    return this.findOne(dto.groupName, user);
  }

  async remove(groupName: string, user: AdminUser) {
    const tenantId = getTenantId(user);
    await this.findOne(groupName, user);
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RadGroupCheck, this.w<RadGroupCheck>(tenantId, { groupName }));
      await manager.delete(RadGroupReply, this.w<RadGroupReply>(tenantId, { groupName }));
    });
    return { message: `Group '${groupName}' deleted` };
  }
}
