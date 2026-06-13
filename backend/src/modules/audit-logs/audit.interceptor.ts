import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditLogsService } from './audit-logs.service';

/** Maps HTTP method + path → (action code, Arabic description, entity info).
 *  Falls back to a generic "<method> <path>" entry when no rule matches. */
function describe(method: string, path: string, body: any, status: number): {
  action: string; description: string; entityType: string | null; entityKey: string | null;
} | null {
  // Skip noisy / non-mutating reads — only log actions that change state OR
  // login attempts. GET requests are ignored except where explicitly listed.
  const m = method.toUpperCase();
  // Strip /api prefix and query string
  const p = path.replace(/^\/api/, '').split('?')[0];

  // Auth
  if (m === 'POST' && p === '/auth/login')          return { action: 'auth.login',         description: 'تسجيل دخول', entityType: null, entityKey: null };
  if (m === 'POST' && p === '/auth/logout')         return { action: 'auth.logout',        description: 'تسجيل خروج', entityType: null, entityKey: null };
  if (m === 'PATCH' && p === '/auth/profile')       return { action: 'auth.profile.update', description: 'تعديل الملف الشخصي', entityType: 'profile', entityKey: null };

  // Subscribers
  let mr;
  if (m === 'POST' && p === '/radius-users')        return { action: 'subscriber.create', description: `أضاف مشترك جديد: ${body?.username ?? ''}`, entityType: 'subscriber', entityKey: body?.username ?? null };
  if (m === 'PATCH' && (mr = p.match(/^\/radius-users\/([^/]+)$/))) {
    const u = decodeURIComponent(mr[1]);
    const fields = Object.keys(body ?? {}).filter(k => k !== 'newUsername').join('، ');
    const renamed = body?.newUsername && body.newUsername !== u ? ` (إعادة تسمية → ${body.newUsername})` : '';
    return { action: 'subscriber.update', description: `عدّل المشترك ${u}${renamed}${fields ? `: ${fields}` : ''}`, entityType: 'subscriber', entityKey: u };
  }
  if (m === 'POST' && (mr = p.match(/^\/radius-users\/([^/]+)\/renew$/))) {
    const u = decodeURIComponent(mr[1]);
    return { action: 'subscriber.renew',   description: `جدّد المشترك ${u} (${body?.durationDays ?? '?'} يوم)`, entityType: 'subscriber', entityKey: u };
  }
  if (m === 'DELETE' && (mr = p.match(/^\/radius-users\/([^/]+)$/))) {
    const u = decodeURIComponent(mr[1]);
    return { action: 'subscriber.archive', description: `أرشف المشترك ${u}`, entityType: 'subscriber', entityKey: u };
  }
  if (m === 'DELETE' && (mr = p.match(/^\/radius-users\/([^/]+)\/permanent$/))) {
    const u = decodeURIComponent(mr[1]);
    return { action: 'subscriber.delete', description: `حذف نهائي للمشترك ${u}`, entityType: 'subscriber', entityKey: u };
  }
  if (m === 'POST'   && (mr = p.match(/^\/radius-users\/([^/]+)\/restore$/)))  { const u = decodeURIComponent(mr[1]); return { action: 'subscriber.restore',  description: `استعاد المشترك ${u}`, entityType: 'subscriber', entityKey: u }; }
  if (m === 'POST'   && (mr = p.match(/^\/radius-users\/([^/]+)\/suspend$/)))  { const u = decodeURIComponent(mr[1]); return { action: 'subscriber.suspend',  description: `أوقف المشترك ${u} مؤقتاً`, entityType: 'subscriber', entityKey: u }; }
  if (m === 'POST'   && (mr = p.match(/^\/radius-users\/([^/]+)\/resume$/)))   { const u = decodeURIComponent(mr[1]); return { action: 'subscriber.resume',   description: `أعاد تشغيل المشترك ${u}`, entityType: 'subscriber', entityKey: u }; }
  if (m === 'POST'   && (mr = p.match(/^\/radius-users\/([^/]+)\/kick$/)))     { const u = decodeURIComponent(mr[1]); return { action: 'subscriber.kick',     description: `طرد المشترك ${u} من الجلسة الحالية`, entityType: 'subscriber', entityKey: u }; }
  if (m === 'DELETE' && (mr = p.match(/^\/radius-users\/([^/]+)\/sessions$/))) { const u = decodeURIComponent(mr[1]); return { action: 'subscriber.clear_sessions', description: `مسح سجل جلسات المشترك ${u}`, entityType: 'subscriber', entityKey: u }; }
  if (m === 'POST'   && (mr = p.match(/^\/radius-users\/([^/]+)\/adjust-usage$/))) {
    const u = decodeURIComponent(mr[1]);
    return { action: 'subscriber.adjust_usage', description: `عدّل استهلاك المشترك ${u} بمقدار ${body?.addGb ?? '?'} GB`, entityType: 'subscriber', entityKey: u };
  }

  // Topups (apply to subscriber)
  if (m === 'POST'   && (mr = p.match(/^\/radius-users\/([^/]+)\/topup$/)))    { const u = decodeURIComponent(mr[1]); return { action: 'topup.apply',  description: `طبّق باقة كوته على المشترك ${u}`, entityType: 'subscriber', entityKey: u }; }
  if (m === 'DELETE' && (mr = p.match(/^\/radius-users\/([^/]+)\/bonus$/)))    { const u = decodeURIComponent(mr[1]); return { action: 'topup.clear_bonus', description: `مسح باقة كوته من المشترك ${u}`, entityType: 'subscriber', entityKey: u }; }
  if (m === 'DELETE' && (mr = p.match(/^\/radius-users\/([^/]+)\/topups\/(\d+)$/))) {
    const u = decodeURIComponent(mr[1]); return { action: 'topup.clear_one', description: `حذف باقة كوته محددة من ${u}`, entityType: 'subscriber', entityKey: u };
  }

  // Plans
  if (m === 'POST'   && p === '/plans')             return { action: 'plan.create', description: `أنشأ خطة إنترنت: ${body?.name ?? ''}`, entityType: 'plan', entityKey: body?.name ?? null };
  if (m === 'PATCH'  && (mr = p.match(/^\/plans\/(\d+)$/)))  return { action: 'plan.update', description: `عدّل خطة الإنترنت #${mr[1]}`, entityType: 'plan', entityKey: mr[1] };
  if (m === 'DELETE' && (mr = p.match(/^\/plans\/(\d+)$/)))  return { action: 'plan.delete', description: `حذف خطة الإنترنت #${mr[1]}`, entityType: 'plan', entityKey: mr[1] };

  // NAS
  if (m === 'POST'   && p === '/nas')               return { action: 'nas.create', description: `أضاف جهاز NAS`, entityType: 'nas', entityKey: null };
  if (m === 'PATCH'  && (mr = p.match(/^\/nas\/(\d+)$/)))   return { action: 'nas.update', description: `عدّل NAS #${mr[1]}`, entityType: 'nas', entityKey: mr[1] };
  if (m === 'DELETE' && (mr = p.match(/^\/nas\/(\d+)$/)))   return { action: 'nas.delete', description: `حذف NAS #${mr[1]}`, entityType: 'nas', entityKey: mr[1] };

  // Topup packages
  if (m === 'POST'   && p === '/topup-packages')             return { action: 'topup_pkg.create', description: `أنشأ باقة كوته: ${body?.name ?? ''}`, entityType: 'topup_pkg', entityKey: body?.name ?? null };
  if (m === 'PATCH'  && (mr = p.match(/^\/topup-packages\/(\d+)$/))) return { action: 'topup_pkg.update', description: `عدّل باقة كوته #${mr[1]}`, entityType: 'topup_pkg', entityKey: mr[1] };
  if (m === 'DELETE' && (mr = p.match(/^\/topup-packages\/(\d+)$/))) return { action: 'topup_pkg.delete', description: `حذف باقة كوته #${mr[1]}`, entityType: 'topup_pkg', entityKey: mr[1] };

  // Voucher cards
  if (m === 'POST'   && p === '/voucher-cards/generate')   return { action: 'card.generate', description: `ولّد كروت إنترنت`, entityType: 'card', entityKey: null };
  if (m === 'PATCH'  && (mr = p.match(/^\/voucher-cards\/(\d+)$/))) return { action: 'card.update', description: `عدّل كرت إنترنت #${mr[1]}`, entityType: 'card', entityKey: mr[1] };
  if (m === 'DELETE' && (mr = p.match(/^\/voucher-cards\/(\d+)$/))) return { action: 'card.delete', description: `حذف كرت إنترنت #${mr[1]}`, entityType: 'card', entityKey: mr[1] };
  if (m === 'POST'   && (mr = p.match(/^\/voucher-cards\/(\d+)\/disable$/))) return { action: 'card.disable', description: `عطّل كرت إنترنت #${mr[1]}`, entityType: 'card', entityKey: mr[1] };

  // Tenant Assistants
  if (m === 'POST'   && p === '/tenant-assistants')             return { action: 'assistant.create', description: `أضاف مشرف: ${body?.email ?? ''}`, entityType: 'assistant', entityKey: body?.email ?? null };
  if (m === 'PATCH'  && (mr = p.match(/^\/tenant-assistants\/(\d+)$/))) return { action: 'assistant.update', description: `عدّل مشرف #${mr[1]}`, entityType: 'assistant', entityKey: mr[1] };
  if (m === 'DELETE' && (mr = p.match(/^\/tenant-assistants\/(\d+)$/))) return { action: 'assistant.delete', description: `حذف مشرف #${mr[1]}`, entityType: 'assistant', entityKey: mr[1] };

  // Tenant settings
  if (m === 'PATCH' && p === '/tenants/settings')   return { action: 'settings.update', description: `عدّل إعدادات الحساب`, entityType: 'settings', entityKey: null };

  // Generic fallback for any other mutating request
  if (m === 'POST' || m === 'PATCH' || m === 'PUT' || m === 'DELETE') {
    return { action: `http.${m.toLowerCase()}`, description: `${m} ${p}`, entityType: null, entityKey: null };
  }
  // Reads are skipped
  return null;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const http = ctx.switchToHttp();
    const req = http.getRequest();
    return next.handle().pipe(
      tap(() => {
        try {
          const user = req.user; // populated by JwtAuthGuard
          if (!user) return;       // skip unauthenticated requests
          const info = describe(req.method, req.originalUrl ?? req.url, req.body, http.getResponse()?.statusCode ?? 200);
          if (!info) return;        // GETs and unmapped reads are skipped
          this.audit.log({
            user,
            tenantId: user.tenantId ?? null,
            method: req.method,
            path: (req.originalUrl ?? req.url).split('?')[0],
            action: info.action,
            description: info.description,
            entityType: info.entityType,
            entityKey: info.entityKey,
            metadata: null,
            statusCode: http.getResponse()?.statusCode ?? 200,
            ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
          });
        } catch { /* swallow — must never break the request */ }
      }),
    );
  }
}
