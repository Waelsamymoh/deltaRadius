import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Server, Group, Activity,
  Building2, LogOut, Wifi, Zap, Settings, CreditCard, Database, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

/** Each nav item carries two permission keys:
 *  - `modPerm` is the moderator-side view key (kept for backward compat)
 *  - `ownerPerm` is the owner-assistant key — when present, an owner_assistant
 *    must have this in their `permissions` array to see the item. */
const allNavItems = [
  { to: '/dashboard',  label: 'الرئيسية',      icon: LayoutDashboard, modPerm: 'dashboard',       ownerPerm: null            },
  { to: '/users',      label: 'المشتركين',       icon: Users,           modPerm: 'users.view',      ownerPerm: 'users.manage'  },
  { to: '/nas',        label: 'الشبكات',         icon: Server,          modPerm: 'nas.view',        ownerPerm: 'nas.manage'    },
  { to: '/groups',     label: 'المجموعات',      icon: Group,           modPerm: 'groups.view',     ownerPerm: 'users.manage'  },
  { to: '/accounting', label: 'المحاسبة',       icon: Activity,        modPerm: 'accounting.view', ownerPerm: 'accounting.view' },
  { to: '/plans',      label: 'خطط الإنترنت',   icon: Zap,             modPerm: 'plans.view',      ownerPerm: 'plans.manage'  },
  { to: '/cards',      label: 'كروت الإنترنت',  icon: CreditCard,      modPerm: 'cards.view',      ownerPerm: 'cards.manage'  },
  { to: '/topups',     label: 'باقات الكوتة',   icon: Database,        modPerm: 'topups.view',     ownerPerm: 'topups.manage' },
]

const roleLabels: Record<string, string> = {
  owner:            'مالك النظام',
  owner_assistant:  'مساعد المالك',
  superadmin:       'مدير',
  admin:            'مشرف',
  moderator:        'بائع',
}

export default function AppLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const isModerator       = user?.role === 'moderator'
  const isOwnerAssistant  = user?.role === 'owner_assistant'
  const isPureOwner       = user?.role === 'owner'
  const permissions       = user?.permissions ?? []

  const navItems = isModerator
    ? allNavItems.filter(item => permissions.includes(item.modPerm))
    : isOwnerAssistant
      ? allNavItems.filter(item => item.ownerPerm === null || permissions.includes(item.ownerPerm))
      : allNavItems

  // Owner-side "إدارة النظام" section visibility
  const showTenantsLink = isPureOwner || (isOwnerAssistant && permissions.includes('tenants.manage'))
  const showSstpLink    = isPureOwner || (isOwnerAssistant && permissions.includes('sstp.manage'))
  const showAdminSection = isPureOwner || showTenantsLink || showSstpLink

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
      isActive
        ? 'bg-primary/15 text-primary border border-primary/20'
        : 'text-white/40 hover:text-white/80 hover:bg-white/5',
    )

  return (
    <div className="flex h-screen bg-[#111]">
      {/* Sidebar */}
      <aside className="w-64 border-l border-white/8 bg-[#0d0d0d] flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/8">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Wifi className="h-4 w-4 text-white" />
          </div>
          <span className="font-black text-lg text-white">
            Delta<span className="text-primary">Group</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}

          {showAdminSection && (
            <>
              <div className="pt-3 pb-1 px-3">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">إدارة النظام</span>
              </div>
              {showTenantsLink && (
                <NavLink to="/tenants" className={navLinkClass}>
                  <Building2 className="h-4 w-4" />
                  العملاء
                </NavLink>
              )}
              {showSstpLink && (
                <NavLink to="/sstp" className={navLinkClass}>
                  <ShieldCheck className="h-4 w-4" />
                  SSTP VPN
                </NavLink>
              )}
              {isPureOwner && (
                <NavLink to="/owner-assistants" className={navLinkClass}>
                  <Users className="h-4 w-4" />
                  المساعدين
                </NavLink>
              )}
            </>
          )}

        </nav>

        {/* User footer */}
        <div className="border-t border-white/8 px-3 py-3 space-y-1">
          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-right"
          >
            <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-black text-xs shrink-0">
              {(user?.fullName || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{user?.fullName || user?.email}</div>
              <div className="text-[10px] text-white/40">{roleLabels[user?.role ?? ''] ?? user?.role}</div>
            </div>
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 transition-all text-sm font-semibold"
          >
            <Settings className="h-4 w-4" />
            الإعدادات
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/40 hover:text-destructive hover:bg-destructive/10 transition-all text-sm font-semibold"
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-[#111]">
        <Outlet />
      </main>
    </div>
  )
}
