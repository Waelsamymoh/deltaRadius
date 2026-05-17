import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DataSource } from 'typeorm';
import { AdminRole } from '../../database/entities/admin-user.entity';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly dataSource: DataSource) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;

    if (!user) return next.handle();

    const isSuperadmin = user.role === AdminRole.SUPERADMIN;

    await this.dataSource.query(
      `SELECT set_config('app.is_superadmin', $1, false)`,
      [isSuperadmin ? 'true' : 'false'],
    );

    if (!isSuperadmin && user.tenantId) {
      await this.dataSource.query(
        `SELECT set_config('app.current_tenant_id', $1::text, false)`,
        [user.tenantId],
      );
    }

    return next.handle();
  }
}
