import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';

@Injectable()
export class TenantSubdomainMiddleware implements NestMiddleware {
  constructor(private readonly dataSource: DataSource) {}

  async use(req: Request & { resolvedTenantId?: number | null }, _res: Response, next: NextFunction) {
    const subdomain =
      (req.headers['x-tenant-subdomain'] as string) ||
      this.extractSubdomain(req.headers.host ?? '');

    if (!subdomain) {
      req.resolvedTenantId = null; // owner / main domain context
      return next();
    }

    const rows = await this.dataSource.query(
      `SELECT id FROM tenants WHERE subdomain = $1 AND is_active = true LIMIT 1`,
      [subdomain],
    );

    if (!rows.length) {
      _res.status(404).json({ code: 'TENANT_NOT_FOUND', subdomain });
      return;
    }

    req.resolvedTenantId = rows[0].id as number;
    next();
  }

  private extractSubdomain(host: string): string | null {
    const parts = host.split('.');
    if (parts.length < 3) return null;
    const sub = parts[0];
    if (sub === 'www' || sub === 'owner' || sub === 'admin') return null;
    return sub;
  }
}
