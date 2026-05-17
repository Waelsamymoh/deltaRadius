import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Server, Group, Activity,
  Building2, LogOut, Radio, Zap, UserCog, Settings, CreditCard, Database,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'

const allNavItems = [
  { to: '/dashboard',  label: 'الرئيسية',       icon: LayoutDashboard, perm: 'dashboard' },
  { to: '/users',      label: 'المشتركين',        icon: Users,           perm: 'users.view' },
  { to: '/nas',        label: 'الشبكات',          icon: Server,          perm: 'nas.view' },
  { to: '/groups',     label: 'المجموعات',       icon: Group,           perm: 'groups.view' },
  { to: '/accounting', label: 'المحاسبة',        icon: Activity,        perm: 'accounting.view' },
  { to: '/plans',      label: 'خطط الإنترنت',    icon: Zap,             perm: 'plans.view' },
  { to: '/cards',      label: 'كروت الإنترنت',   icon: CreditCard,      perm: 'cards.view' },
  { to: '/topups',     label: 'باقات الكوتة',    icon: Database,        perm: 'topups.view' },
]

const roleLabels: Record<string, string> = {
  owner:      'مالك النظام',
  superadmin: 'مدير',
  admin:      'مشرف',
  moderator:  'بائع',
}

export default function AppLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const isModerator = user?.role === 'moderator'
  const permissions = user?.permissions ?? []

  const navItems = isModerator
    ? allNavItems.filter(item => permissions.includes(item.perm))
    : allNavItems

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    )

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-l bg-card flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 py-5 border-b">
          <Radio className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">RadiusManager</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}

          {user?.role === 'owner' && (
            <>
              <NavLink to="/tenants" className={navLinkClass}>
                <Building2 className="h-4 w-4" />
                العملاء
              </NavLink>
              <NavLink to="/admin-users" className={navLinkClass}>
                <UserCog className="h-4 w-4" />
                المدراء
              </NavLink>
            </>
          )}

          {user?.role === 'superadmin' && (
            <NavLink to="/admin-users" className={navLinkClass}>
              <UserCog className="h-4 w-4" />
              المشرفون
            </NavLink>
          )}

          {user?.role === 'admin' && (
            <NavLink to="/admin-users" className={navLinkClass}>
              <UserCog className="h-4 w-4" />
              البائعون
            </NavLink>
          )}
        </nav>

        {/* User info + logout */}
        <div className="border-t px-4 py-4 space-y-1">
          <button
            onClick={() => navigate('/profile')}
            className="w-full text-right px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
          >
            <div className="text-xs font-medium truncate">{user?.fullName || user?.email}</div>
            <div className="text-xs text-muted-foreground">
              {roleLabels[user?.role ?? ''] ?? user?.role}
            </div>
          </button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => navigate('/profile')}>
            <Settings className="h-4 w-4" />
            الإعدادات
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={logout}>
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
