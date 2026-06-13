import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Users, Calendar, Clock, Eye, EyeOff, RefreshCw, Search, ChevronDown, ChevronRight, Database, Pause, Play, ArchiveRestore, ExternalLink } from 'lucide-react'
import { useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom'
import { usersApi, plansApi, topupsApi, tenantSettingsApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

const schema = z.object({
  username:     z.string().min(1, 'مطلوب'),
  password:     z.string().min(4, 'على الأقل 4 أحرف').optional().or(z.literal('')),
  planId:       z.coerce.number().min(1, 'اختر خطة'),
  startDate:    z.string().min(1, 'مطلوب'),
  durationDays: z.coerce.number().min(1, 'مطلوب'),
  firstName:    z.string().min(1, 'مطلوب'),
  address:      z.string().optional(),
  mobile:       z.string().regex(/^\d*$/, 'أرقام فقط').optional(),
  notes:        z.string().optional(),
  groupName:    z.string().optional(),
  initialUsageGb: z.coerce.number().min(0).optional(),
  portalPassword: z.string().optional(),
  connectionType: z.enum(['hotspot', 'broadband']).default('hotspot'),
})

const editSchema = schema.partial().extend({
  password: z.string().min(4).optional().or(z.literal('')),
})

type CreateForm = z.infer<typeof schema>
type EditForm   = z.infer<typeof editSchema>

type RadUser = {
  username:              string
  firstName:             string
  mobile:                string | null
  address:               string | null
  notes:                 string | null
  groupName:             string | null
  connectionType:        'hotspot' | 'broadband'
  startDate:             string
  durationDays:          number
  expiresAt:             string
  remainingDays:         number
  planId:                number | null
  plan:                  { id: number; name: string; price: string | number | null } | null
  tenantId:              number | null
  tenantName:            string | null
  isOnline:              boolean
  isSuspended:           boolean
  isArchived:            boolean
  remainingDownloadBytes: number | null
  downloadLimitBytes:    number | null
  totalDownloadBytes:    number
  bonusTotalBytes:       number
  bonusUsedBytes:        number
  bonusRemainingBytes:   number
  topups:                Array<{
    id: number
    packageName: string | null
    appliedAt: string
    expiresAt: string | null
    totalBytes: number
    usedBytes: number
    remainingBytes: number
  }>
}

type Plan = { id: number; name: string }

const fmtBytes = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB`
  : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024).toFixed(0)} KB`

export default function UsersPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user: authUser } = useAuthStore()
  const isSuperadmin = authUser?.role === 'superadmin'
  const [collapsedTenants, setCollapsedTenants] = useState<Set<number>>(new Set())
  // Subscribers whose extra-bonus rows are expanded (default: collapsed).
  // Only matters when a user has 2+ topups — first one always shows.
  const [expandedBonus, setExpandedBonus] = useState<Set<string>>(new Set())

  const toggleExpandBonus = (username: string) => {
    setExpandedBonus(prev => {
      const next = new Set(prev)
      if (next.has(username)) next.delete(username)
      else next.add(username)
      return next
    })
  }
  const [open, setOpen]         = useState(false)
  const [editing, setEditing]   = useState<RadUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ username: string; tenantId: number | null } | null>(null)
  const [renewTarget, setRenewTarget] = useState<RadUser | null>(null)
  const [renewDays, setRenewDays] = useState(30)
  // Sales-side renewal can also swap the plan at the same time
  const [renewPlanId, setRenewPlanId] = useState<number | ''>('')
  const [topupTarget, setTopupTarget] = useState<RadUser | null>(null)
  const [clearBonusTarget, setClearBonusTarget] = useState<{ user: RadUser; topupId: number; label: string; remainingBytes: number; totalBytes: number } | null>(null)
  const [topupPackageId, setTopupPackageId] = useState<number | ''>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Sales page only: manual "search & click" — results don't load until the
  // user types a full mobile and clicks the Show button. Stored separately so
  // typing in the input doesn't trigger a refetch.
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'online' | 'active' | 'suspended' | 'archived' | 'all'>('all')
  const [permanentTarget, setPermanentTarget] = useState<{ username: string; tenantId: number | null } | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<{ username: string; firstName: string; tenantId: number | null } | null>(null)
  const [portalLinkCopied, setPortalLinkCopied] = useState(false)
  // Multi-select for bulk actions. Keyed by tenant::username so superadmin's
  // cross-tenant view can't collide on duplicate usernames.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState<null | 'archive' | 'permanent'>(null)
  // Receipt shown after a successful Sales renewal — contains the snapshot of
  // the renewal details and offers a "save as PNG" button.
  const [receiptTarget, setReceiptTarget] = useState<{
    firstName: string
    mobile: string | null
    planName: string
    price: number | null
    days: number
    paidAt: Date
    expiresAt: Date
  } | null>(null)

  const [searchParams] = useSearchParams()
  const tenantFilter = searchParams.get('tenant') ? Number(searchParams.get('tenant')) : null
  const location = useLocation()
  const isSalesPage = location.pathname.startsWith('/sales')

  // Supervisors with the `users.hide_list` permission see the list only after
  // typing in the search box — the backend returns [] when search is empty.
  const userPerms = authUser?.permissions ?? []
  const listHidden = userPerms.includes('users.hide_list')

  // Per-action gates. Owner / superadmin / admin / moderator bypass —
  // only tenant_assistant + owner_assistant are filtered by `permissions[]`.
  const isAssistant = authUser?.role === 'tenant_assistant' || authUser?.role === 'owner_assistant'
  const canDo = (key: string) => !isAssistant || userPerms.includes(key)
  const canCreate     = canDo('users.create')
  const canEdit       = canDo('users.edit')
  const canRenew      = canDo('users.renew')
  const canDelete     = canDo('users.delete')
  const canSuspend    = canDo('users.suspend')
  const canTopup      = canDo('users.topup')
  const canViewDetail = canDo('users.view_detail')

  // On Sales page the search is manual: use the submitted value, not the live
  // input. Everywhere else, the live input drives the query as you type.
  const effectiveSearch = isSalesPage ? submittedSearch : search.trim()

  const { data: users = [], isLoading } = useQuery<RadUser[]>({
    queryKey: ['radius-users', { tenant: tenantFilter, status: statusFilter, search: effectiveSearch }],
    queryFn: () => usersApi.list(tenantFilter, statusFilter, effectiveSearch || undefined).then(r => r.data),
    refetchInterval: 5_000,
    enabled: !isSalesPage || !!effectiveSearch,
  })

  const suspendMutation = useMutation({
    mutationFn: ({ username, tenantId }: { username: string; tenantId: number | null }) =>
      usersApi.suspend(username, tenantId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['radius-users'] }); setSuspendTarget(null) },
  })
  const resumeMutation = useMutation({
    mutationFn: ({ username, tenantId }: { username: string; tenantId: number | null }) =>
      usersApi.resume(username, tenantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['radius-users'] }),
  })
  const restoreMutation = useMutation({
    mutationFn: ({ username, tenantId }: { username: string; tenantId: number | null }) =>
      usersApi.restore(username, tenantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['radius-users'] }),
  })
  const permanentMutation = useMutation({
    mutationFn: ({ username, tenantId }: { username: string; tenantId: number | null }) =>
      usersApi.removePermanent(username, tenantId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['radius-users'] }); setPermanentTarget(null) },
  })

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ['plans', { tenant: tenantFilter }],
    queryFn: () => plansApi.list(tenantFilter).then(r => r.data),
  })

  // Tenant's configured expiry time-of-day — used by the Sales receipt so the
  // displayed end-time matches the FreeRADIUS Expiration the backend will store.
  const { data: tenantSettings } = useQuery<{ defaultExpiryTime: string }>({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get().then(r => r.data),
    enabled: isSalesPage,
  })
  const defaultExpiryTime = tenantSettings?.defaultExpiryTime ?? '12:00'

  const today = new Date().toISOString().split('T')[0]

  // Normalise Arabic-Indic + Persian digits so users typing "٠١٠" on an
  // Arabic keyboard still match "010" stored in the DB.
  const normDigits = (s: string) => s
    .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
    .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48))

  const filteredUsers = search.trim()
    ? users.filter(u => {
        const q = normDigits(search.trim()).toLowerCase()
        return (
          u.username.toLowerCase().includes(q) ||
          (u.firstName ?? '').toLowerCase().includes(q) ||
          (u.mobile && normDigits(u.mobile).includes(q))
        )
      })
    : users

  // ── Multi-select helpers ──────────────────────────────────────────────
  const rowKey = (u: RadUser) => `${u.tenantId ?? 'none'}::${u.username}`
  const selectedUsers = filteredUsers.filter(u => selected.has(rowKey(u)))
  const allSelectedIn = (list: RadUser[]) => list.length > 0 && list.every(u => selected.has(rowKey(u)))
  const setSelectMany = (list: RadUser[], on: boolean) => setSelected(prev => {
    const next = new Set(prev)
    list.forEach(u => (on ? next.add(rowKey(u)) : next.delete(rowKey(u))))
    return next
  })
  const toggleSelect = (u: RadUser) => setSelected(prev => {
    const next = new Set(prev)
    const k = rowKey(u)
    next.has(k) ? next.delete(k) : next.add(k)
    return next
  })
  const runBulk = (fn: (t: { username: string; tenantId: number | null }) => void) => {
    selectedUsers.forEach(u => fn({ username: u.username, tenantId: u.tenantId }))
    setSelected(new Set())
    setBulkConfirm(null)
  }
  // Drop the selection whenever the visible set changes so a bulk action can't
  // hit rows the user can no longer see.
  useEffect(() => { setSelected(new Set()) }, [statusFilter, tenantFilter, effectiveSearch])

  // Group by tenant for superadmin view
  const tenantGroups: { tenantId: number | null; tenantName: string; users: RadUser[] }[] = []
  if (isSuperadmin) {
    const map = new Map<string, { tenantId: number | null; tenantName: string; users: RadUser[] }>()
    for (const u of filteredUsers) {
      const key = String(u.tenantId ?? 'none')
      if (!map.has(key)) {
        map.set(key, {
          tenantId: u.tenantId,
          tenantName: u.tenantName ?? '',
          users: [],
        })
      }
      map.get(key)!.users.push(u)
    }
    tenantGroups.push(...map.values())
  }

  const toggleTenant = (tenantId: number | null) => {
    const key = tenantId ?? -1
    setCollapsedTenants(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(schema),
    defaultValues: { startDate: today, durationDays: 30 },
  })

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => usersApi.create(data, tenantFilter),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['radius-users'] }); closeDialog() },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'حدث خطأ'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ username, data, tenantId }: { username: string; data: EditForm; tenantId: number | null }) =>
      usersApi.update(username, data, tenantId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['radius-users'] }); closeDialog() },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'حدث خطأ'),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ username, tenantId }: { username: string; tenantId: number | null }) =>
      usersApi.remove(username, tenantId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['radius-users'] }); setDeleteTarget(null) },
  })

  const renewMutation = useMutation({
    mutationFn: ({ username, days, tenantId, planId }: { username: string; days: number; tenantId: number | null; planId?: number }) =>
      usersApi.renew(username, today, days, tenantId, planId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['radius-users'] })
      // Capture the renewed subscriber's info BEFORE clearing renewTarget so
      // the Sales receipt has everything it needs to render.
      if (isSalesPage && renewTarget) {
        const paidAt = new Date()
        // Subscription ends on day N at the tenant's configured time-of-day
        // (no extra hour buffer). Matches the FreeRADIUS Expiration the
        // backend writes.
        const [hh, mm] = defaultExpiryTime.split(':').map(Number)
        const expiresAt = new Date(paidAt.getTime() + vars.days * 86400000)
        expiresAt.setHours(hh || 12, mm || 0, 0, 0)
        setReceiptTarget({
          firstName: renewTarget.firstName,
          mobile: renewTarget.mobile,
          planName: renewTarget.plan?.name ?? '—',
          price: renewTarget.plan?.price != null ? Number(renewTarget.plan.price) : null,
          days: vars.days,
          paidAt,
          expiresAt,
        })
      }
      setRenewTarget(null)
      if (isSalesPage) { setSubmittedSearch(''); setSearch('') }
    },
  })

  const { data: topupPackages = [] } = useQuery<{ id: number; name: string; sizeGb: string; price: string }[]>({
    queryKey: ['topup-packages'],
    queryFn: () => topupsApi.listPackages().then(r => r.data),
  })

  const topupMutation = useMutation({
    mutationFn: ({ username, packageId }: { username: string; packageId: number }) =>
      topupsApi.applyToUser(username, packageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['radius-users'] })
      setTopupTarget(null); setTopupPackageId('')
    },
  })

  const clearBonusMutation = useMutation({
    mutationFn: ({ username, topupId }: { username: string; topupId: number }) =>
      topupsApi.clearOneTopup(username, topupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['radius-users'] })
      setClearBonusTarget(null)
    },
  })

  const openRenew = (u: RadUser) => {
    // Sales always uses the fixed 30-day default (input is hidden); /users
    // pre-fills with the subscriber's current cycle length so the admin can tweak it.
    setRenewDays(isSalesPage ? 30 : u.durationDays)
    setRenewPlanId(u.planId ?? '')
    setRenewTarget(u)
  }

  // Sales workflow: after a successful mobile search, jump straight into the
  // renewal dialog for the matched subscriber — skip the table entirely.
  useEffect(() => {
    if (isSalesPage && submittedSearch && users.length > 0 && !renewTarget) {
      openRenew(users[0])
    }
  }, [isSalesPage, submittedSearch, users, renewTarget])

  const openCreate = () => {
    // Sales page hides the username input — pre-fill with a sentinel that
    // satisfies Zod's `min(1)` rule. onSubmit replaces it with the real
    // auto-generated value derived from the subscriber's name.
    const seed = isSalesPage ? 'auto' : ''
    reset({ startDate: today, durationDays: 30, username: seed, password: '', firstName: '', initialUsageGb: 0, connectionType: 'hotspot' })
    setEditing(null)
    setFormError(null)
    setOpen(true)
  }

  const openEdit = (u: RadUser) => {
    editForm.reset({
      username:     u.username,
      firstName:    u.firstName,
      mobile:       u.mobile ?? '',
      address:      u.address ?? '',
      notes:        u.notes ?? '',
      groupName:    u.groupName ?? '',
      startDate:    u.startDate,
      durationDays: u.durationDays,
      planId:       u.planId ?? undefined,
      password:     '',
      connectionType: u.connectionType ?? 'hotspot',
    })
    setEditing(u)
    setFormError(null)
    setOpen(true)
  }

  const closeDialog = () => { setOpen(false); setEditing(null); reset(); editForm.reset(); setFormError(null) }

  const onSubmit = (data: CreateForm) => {
    const payload = { ...data }
    if (!payload.password) delete payload.password
    // On Sales page the username input is hidden — replace whatever sentinel
    // was used to pass Zod validation with a unique generated value based on
    // the subscriber's name + a short random suffix.
    if (isSalesPage) {
      const suffix = Math.random().toString(36).slice(2, 6)
      const base = (payload.firstName || 'sub').replace(/\s+/g, '').toLowerCase()
      payload.username = `${base}-${suffix}`
    }
    createMutation.mutate(payload as CreateForm)
  }

  const onEditSubmit = (data: EditForm) => {
    if (!editing) return
    const payload: EditForm & { newUsername?: string } = {}
    // Rename: send only if the admin actually changed the username.
    if (data.username && data.username.trim() && data.username.trim() !== editing.username) {
      payload.newUsername = data.username.trim()
    }
    if (data.password)                  payload.password       = data.password
    if (data.planId !== undefined)      payload.planId         = data.planId
    if (data.startDate)                 payload.startDate      = data.startDate
    if (data.durationDays)              payload.durationDays   = data.durationDays
    if (data.firstName !== undefined)   payload.firstName      = data.firstName
    if (data.address !== undefined)     payload.address        = data.address
    if (data.mobile !== undefined)      payload.mobile         = data.mobile
    if (data.notes !== undefined)       payload.notes          = data.notes
    if (data.groupName !== undefined)   (payload as any).groupName = data.groupName
    if (data.portalPassword)            (payload as any).portalPassword = data.portalPassword
    if (data.connectionType !== undefined) (payload as any).connectionType = data.connectionType
    updateMutation.mutate({ username: editing.username, data: payload, tenantId: editing.tenantId })
  }

  const isExpired = (expiresAt: string) => {
    const parts = expiresAt.split(' ')
    const months: Record<string, number> = {
      Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11
    }
    const d = new Date(Number(parts[2]), months[parts[0]], Number(parts[1]))
    return d < new Date()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7" /> المشتركين
          </h1>
          <p className="text-muted-foreground mt-1">إدارة مستخدمي الشبكة</p>
          {tenantFilter && (
            <Link
              to={`/tenants/${tenantFilter}`}
              className="inline-flex items-center gap-1.5 mt-2 text-xs bg-primary/15 text-primary border border-primary/20 px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors"
            >
              العودة للوحة العميل
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            title="رابط بوابة المشترك — يدخل المشترك بموبايله وكلمة مروره"
            onClick={() => {
              const url = `${window.location.origin}/users`
              navigator.clipboard?.writeText(url).then(
                () => setPortalLinkCopied(true),
                () => setPortalLinkCopied(true),
              )
              setTimeout(() => setPortalLinkCopied(false), 2500)
            }}
          >
            <ExternalLink className="h-4 w-4" />
            {portalLinkCopied ? 'تم نسخ الرابط ✓' : 'رابط بوابة المشترك'}
          </Button>
          {canCreate && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> مستخدم جديد
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          {isSalesPage ? (
            // Sales: centred, prominent mobile-search bar. Everything else
            // (title badge, status filter) is hidden since the user only
            // interacts through this single control.
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <div className="text-center">
                <h2 className="text-lg font-bold flex items-center justify-center gap-2">
                  <Search className="h-5 w-5 text-primary" /> بيانات العميل
                </h2>
                <p className="text-xs text-muted-foreground mt-1">أدخل رقم موبايل المشترك كاملاً (11 رقم)</p>
              </div>
              <div className="flex items-center gap-2 w-full max-w-md">
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter' && search.trim().length >= 11) setSubmittedSearch(search.trim()) }}
                  placeholder="01XXXXXXXXX"
                  className="flex-1 h-11 text-center text-lg font-mono tracking-wider"
                  inputMode="numeric"
                  maxLength={15}
                  dir="ltr"
                />
                <Button
                  onClick={() => setSubmittedSearch(search.trim())}
                  disabled={search.trim().length < 11}
                  className="h-11 px-6 gap-1.5 text-base"
                  size="lg"
                >
                  <Search className="h-4 w-4" /> إظهار
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">
                المستخدمون{' '}
                <Badge variant="secondary" className="ml-2">
                  {search.trim() ? `${filteredUsers.length} / ${users.length}` : users.length}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
                  title="فلتر الحالة"
                >
                  <option value="online">المتصلين الآن</option>
                  <option value="active">الفعّالين</option>
                  <option value="suspended">الموقوفين مؤقتاً</option>
                  <option value="archived">المؤرشفين</option>
                  <option value="all">الكل</option>
                </select>
                <div className="relative w-64">
                  <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="بحث بالاسم أو الموبايل أو اسم المستخدم..."
                    className="pr-8 text-sm"
                    dir="rtl"
                  />
                </div>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!isSalesPage && selectedUsers.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-sm font-medium">تم تحديد {selectedUsers.length} مشترك</span>
              <div className="flex flex-wrap items-center gap-2 mr-auto">
                {canSuspend && (
                  <>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => runBulk(suspendMutation.mutate)}>
                      <Pause className="h-3.5 w-3.5" /> تعطيل
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => runBulk(resumeMutation.mutate)}>
                      <Play className="h-3.5 w-3.5" /> تفعيل
                    </Button>
                  </>
                )}
                {canDelete && (
                  <>
                    <Button size="sm" variant="outline" className="gap-1 text-amber-600 border-amber-300 hover:bg-amber-50" onClick={() => setBulkConfirm('archive')}>
                      <Trash2 className="h-3.5 w-3.5" /> أرشفة
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => setBulkConfirm('permanent')}>
                      <Trash2 className="h-3.5 w-3.5" /> حذف نهائي
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button>
              </div>
            </div>
          )}
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {isSalesPage && !submittedSearch
                ? 'أدخل رقم الموبايل كاملاً واضغط "إظهار" لعرض النتيجة'
                : listHidden && !search.trim()
                ? 'اكتب اسم المشترك في خانة البحث لعرضه'
                : search.trim() && search.trim().length < 4 && !isSalesPage
                  ? 'اكتب 4 أحرف على الأقل للبحث'
                  : (search.trim() || submittedSearch)
                    ? 'لا توجد نتائج للبحث'
                    : statusFilter === 'online'     ? 'لا يوجد مشتركون متصلون الآن'
                    : statusFilter === 'archived'  ? 'لا يوجد مشتركون مؤرشفون'
                    : statusFilter === 'suspended' ? 'لا يوجد مشتركون موقوفون مؤقتاً'
                    : statusFilter === 'active'    ? 'لا يوجد مشتركون فعّالون'
                    : 'لا يوجد مشتركون بعد'}
            </p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد نتائج للبحث</p>
          ) : isSalesPage ? (
            // Sales workflow shows results via the auto-opened renewal dialog
            // instead of a list — keep the table empty.
            <p className="text-center text-muted-foreground py-8">جاري فتح حوار التجديد...</p>
          ) : isSuperadmin ? (
            /* ── Superadmin grouped view ── */
            <div className="space-y-4">
              {tenantGroups.map(group => {
                const collapsed = collapsedTenants.has(group.tenantId ?? -1)
                return (
                  <div key={group.tenantId ?? 'none'} className="border rounded-lg overflow-hidden">
                    {/* Group header */}
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-right"
                      onClick={() => toggleTenant(group.tenantId)}
                    >
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm">{group.tenantName}</span>
                        <Badge variant="secondary">{group.users.length} مشترك</Badge>
                      </div>
                      {collapsed
                        ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {/* Group table */}
                    {!collapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/20">
                              {!isSalesPage && (
                                <th className="py-2 px-3 w-8">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 cursor-pointer accent-primary"
                                    checked={allSelectedIn(group.users)}
                                    onChange={e => setSelectMany(group.users, e.target.checked)}
                                  />
                                </th>
                              )}
                              {!isSalesPage && <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم المستخدم</th>}
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">الاسم</th>
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">الخطة</th>
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">الأيام المتبقية</th>
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">الكمية المتبقية</th>
                              <th className="text-left py-2 px-3 font-medium text-muted-foreground">إجراءات</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.users.map(u => <UserRow key={u.username} u={u} navigate={navigate} openEdit={openEdit} openRenew={openRenew} setDeleteTarget={setDeleteTarget} setTopupTarget={setTopupTarget} setClearBonusTarget={setClearBonusTarget} expandedBonus={expandedBonus} toggleExpandBonus={toggleExpandBonus} fmtBytes={fmtBytes} onSuspend={(n) => setSuspendTarget(n)} onResume={(n) => resumeMutation.mutate(n)} onRestore={(n) => restoreMutation.mutate(n)} onPermanentDelete={(n) => setPermanentTarget(n)} perms={{ canEdit, canRenew, canDelete, canSuspend, canTopup, canViewDetail }} isSalesPage={isSalesPage} selectable={!isSalesPage} isSelected={selected.has(rowKey(u))} onToggleSelect={() => toggleSelect(u)} />)}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── Regular admin flat view ── */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {!isSalesPage && (
                      <th className="py-2 px-3 w-8">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-primary"
                          checked={allSelectedIn(filteredUsers)}
                          onChange={e => setSelectMany(filteredUsers, e.target.checked)}
                        />
                      </th>
                    )}
                    {!isSalesPage && <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم المستخدم</th>}
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الاسم</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الخطة</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الأيام المتبقية</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">الكمية المتبقية</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => <UserRow key={u.username} u={u} navigate={navigate} openEdit={openEdit} openRenew={openRenew} setDeleteTarget={setDeleteTarget} setTopupTarget={setTopupTarget} setClearBonusTarget={setClearBonusTarget} expandedBonus={expandedBonus} toggleExpandBonus={toggleExpandBonus} fmtBytes={fmtBytes} onSuspend={(n) => setSuspendTarget(n)} onResume={(n) => resumeMutation.mutate(n)} onRestore={(n) => restoreMutation.mutate(n)} onPermanentDelete={(n) => setPermanentTarget(n)} perms={{ canEdit, canRenew, canDelete, canSuspend, canTopup, canViewDetail }} isSalesPage={isSalesPage} selectable={!isSalesPage} isSelected={selected.has(rowKey(u))} onToggleSelect={() => toggleSelect(u)} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={open && !editing} onOpenChange={v => { if (!v) closeDialog() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            {formError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
            <div className={isSalesPage ? '' : 'grid grid-cols-2 gap-3'}>
              {!isSalesPage && (
                <div className="space-y-1">
                  <Label>اسم المستخدم *</Label>
                  <Input {...register('username')} placeholder="user01" dir="ltr" />
                  {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
                </div>
              )}
              <div className="space-y-1">
                <Label>كلمة المرور <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
                <Input type="text" {...register('password')} placeholder="اتركه فارغاً بدون باسورد" dir="ltr" />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>الاسم الأول *</Label>
              <Input {...register('firstName')} placeholder="أحمد" />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>خطة الإنترنت *</Label>
              <Select {...register('planId')}>
                <option value="">— اختر خطة —</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              {errors.planId && <p className="text-xs text-destructive">{errors.planId.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>نوع الاتصال *</Label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2 hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" value="hotspot" {...register('connectionType')} className="accent-primary" />
                  <span className="text-sm font-medium">هوتسبوت</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2 hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" value="broadband" {...register('connectionType')} className="accent-primary" />
                  <span className="text-sm font-medium">برودباند (PPPoE)</span>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>تاريخ البدء *</Label>
                <Input type="date" {...register('startDate')} />
                {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>المدة (بالأيام) *</Label>
                <Input type="number" {...register('durationDays')} min={1} placeholder="30" />
                {errors.durationDays && <p className="text-xs text-destructive">{errors.durationDays.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>رقم الموبايل</Label>
              <Input {...register('mobile')} placeholder="01XXXXXXXXX" dir="ltr" inputMode="numeric" />
              {errors.mobile && <p className="text-xs text-destructive">{errors.mobile.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input {...register('address')} placeholder="المدينة، الحي..." />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                المجموعة <span className="text-muted-foreground text-xs">— اختياري</span>
              </Label>
              <Input {...register('groupName')} placeholder="اسم المجموعة (مثلاً: عمارة أ، فرع القاهرة)" />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input {...register('notes')} placeholder="أي ملاحظات إضافية" />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                استهلاك مبدئي (GB) <span className="text-muted-foreground text-xs">— اختياري</span>
              </Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                {...register('initialUsageGb')}
                placeholder="0"
                dir="ltr"
                className="text-center"
              />
              <p className="text-xs text-muted-foreground">
                للمشتركين المنقولين من نظام آخر — يضيف هذه الكمية على عداد الاستهلاك مباشرةً.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                كلمة مرور بوابة المشترك <span className="text-muted-foreground text-xs">— اختياري</span>
              </Label>
              <Input {...register('portalPassword')} dir="ltr" placeholder="باسورد لدخول المشترك لبوابته" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'جاري الحفظ...' : 'إضافة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={v => { if (!v) closeDialog() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل: <span dir="ltr">{editing?.username}</span></DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-3">
            {formError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
            <div className="space-y-1">
              <Label>اسم المستخدم</Label>
              <Input {...editForm.register('username')} dir="ltr" placeholder="user01" />
              <p className="text-xs text-muted-foreground">
                تغيير اسم المستخدم سيُحدّث كل الجداول المرتبطة (RADIUS، الجلسات، الفواتير...) ويفصل الجلسات النشطة.
              </p>
            </div>
            <div className="space-y-1">
              <Label>الاسم الأول</Label>
              <Input {...editForm.register('firstName')} />
            </div>
            <div className="space-y-1">
              <Label>خطة الإنترنت</Label>
              <Select {...editForm.register('planId')}>
                <option value="">— بدون تغيير —</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>نوع الاتصال</Label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2 hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" value="hotspot" {...editForm.register('connectionType')} className="accent-primary" />
                  <span className="text-sm font-medium">هوتسبوت</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2 hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" value="broadband" {...editForm.register('connectionType')} className="accent-primary" />
                  <span className="text-sm font-medium">برودباند (PPPoE)</span>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>تاريخ البدء</Label>
                <Input type="date" {...editForm.register('startDate')} />
              </div>
              <div className="space-y-1">
                <Label>المدة (أيام)</Label>
                <Input type="number" {...editForm.register('durationDays')} min={1} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>رقم الموبايل</Label>
              <Input {...editForm.register('mobile')} dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input {...editForm.register('address')} />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                المجموعة <span className="text-muted-foreground text-xs">— اختياري</span>
              </Label>
              <Input {...editForm.register('groupName')} placeholder="اسم المجموعة" />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input {...editForm.register('notes')} />
            </div>
            <div className="space-y-1">
              <Label>كلمة مرور جديدة (اتركها فارغة للإبقاء على القديمة)</Label>
              <Input type="password" {...editForm.register('password')} placeholder="••••••••" />
            </div>
            <div className="space-y-1">
              <Label>كلمة مرور بوابة المشترك (اتركها فارغة للإبقاء)</Label>
              <Input {...editForm.register('portalPassword')} dir="ltr" placeholder="باسورد دخول المشترك لبوابته" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Renew Dialog */}
      <Dialog open={!!renewTarget} onOpenChange={() => {
        setRenewTarget(null)
        // Sales flow: closing the dialog resets the search so the next
        // mobile lookup re-triggers it fresh.
        if (isSalesPage) { setSubmittedSearch(''); setSearch('') }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-green-600" /> تجديد اشتراك
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">المشترك: </span>
              <span className="font-medium">{renewTarget?.firstName}</span>
              {!isSalesPage && (
                <span className="font-mono text-xs text-muted-foreground mr-1">({renewTarget?.username})</span>
              )}
            </div>
            {isSalesPage && (
              <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">السعر المطلوب:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {renewTarget?.plan?.price != null
                    ? `${Number(renewTarget.plan.price).toFixed(2)} ج.م`
                    : '—'}
                </span>
              </div>
            )}
            {!isSalesPage && (
              <div className="space-y-1">
                <Label>مدة التجديد (بالأيام)</Label>
                <Input
                  type="number"
                  min={1}
                  value={renewDays}
                  onChange={e => setRenewDays(Number(e.target.value))}
                  className="text-center text-lg font-bold"
                />
              </div>
            )}
            {!isSalesPage && (
              <p className="text-xs text-muted-foreground">
                سيبدأ من اليوم وينتهي بعد {renewDays} يوم
                {' '}({new Date(Date.now() + renewDays * 86400000).toLocaleDateString('ar-EG')})
              </p>
            )}
            {!isSalesPage && (
              <div className="flex gap-2 text-xs text-muted-foreground">
                {[7, 15, 30, 60, 90].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setRenewDays(d)}
                    className={`px-2 py-1 rounded border transition-colors ${renewDays === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                  >
                    {d}د
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRenewTarget(null)
                // Sales: clear the search too, otherwise the useEffect that
                // auto-opens the dialog re-fires immediately and the cancel
                // appears to do nothing.
                if (isSalesPage) { setSubmittedSearch(''); setSearch('') }
              }}
            >إلغاء</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => renewTarget && renewMutation.mutate({
                username: renewTarget.username,
                days: renewDays,
                tenantId: renewTarget.tenantId,
              })}
              disabled={renewMutation.isPending || renewDays < 1}
            >
              {renewMutation.isPending ? 'جاري التجديد...' : `تجديد ${renewDays} يوم`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Topup Dialog */}
      <Dialog open={!!topupTarget} onOpenChange={() => { setTopupTarget(null); setTopupPackageId('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-500" /> إضافة كوتة لـ {isSalesPage ? topupTarget?.firstName : topupTarget?.username}
            </DialogTitle>
          </DialogHeader>
          {topupPackages.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              لا توجد باقات كوتة. أنشئ باقة من صفحة "باقات الكوتة" أولاً.
            </div>
          ) : (
            <div className="space-y-3">
              <Label>اختر الباقة</Label>
              <Select
                value={topupPackageId}
                onChange={e => setTopupPackageId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">— اختر باقة —</option>
                {topupPackages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.sizeGb}GB ({Number(p.price).toFixed(2)} ج.م)
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                الكوتة المضافة تنضم إلى الحد الأصلي. لو كان المشترك على الباقة البديلة، يستعيد سرعة الخطة الأصلية.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTopupTarget(null); setTopupPackageId('') }}>إلغاء</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={!topupPackageId || topupMutation.isPending}
              onClick={() => topupTarget && topupPackageId && topupMutation.mutate({ username: topupTarget.username, packageId: Number(topupPackageId) })}
            >
              {topupMutation.isPending ? 'جاري الإضافة...' : 'إضافة الكوتة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear one topup Dialog */}
      <Dialog open={!!clearBonusTarget} onOpenChange={() => setClearBonusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" /> مسح باقة إضافية
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            سيتم حذف الباقة <strong>{clearBonusTarget?.label}</strong> من المشترك <strong {...(isSalesPage ? {} : { dir: 'ltr' })}>{
              isSalesPage ? clearBonusTarget?.user.firstName : clearBonusTarget?.user.username
            }</strong>.
          </p>
          {clearBonusTarget && (
            <p className="text-xs text-muted-foreground">
              قيمة الباقة حالياً: <strong>{fmtBytes(clearBonusTarget.remainingBytes)}</strong> من {fmtBytes(clearBonusTarget.totalBytes)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearBonusTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => clearBonusTarget && clearBonusMutation.mutate({ username: clearBonusTarget.user.username, topupId: clearBonusTarget.topupId })}
              disabled={clearBonusMutation.isPending}
            >
              {clearBonusMutation.isPending ? 'جاري المسح...' : 'مسح'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Confirm Dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={() => setSuspendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Pause className="h-5 w-5" /> إيقاف مؤقت
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من إيقاف المشترك{' '}
            <strong className="text-foreground">{suspendTarget?.firstName}</strong>{' '}
            {!isSalesPage && (
              <span className="font-mono text-xs" dir="ltr">({suspendTarget?.username})</span>
            )}؟
            سيتم قطع اتصاله ومنعه من تسجيل الدخول حتى يتم تشغيله مرة أخرى. بياناته واشتراكه لن يتأثروا.
          </p>
          {suspendMutation.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
              {(suspendMutation.error as any)?.response?.data?.message ?? 'تعذّر الإيقاف'}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>إلغاء</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              onClick={() => suspendTarget && suspendMutation.mutate({ username: suspendTarget.username, tenantId: suspendTarget.tenantId })}
              disabled={suspendMutation.isPending}
            >
              <Pause className="h-3.5 w-3.5" />
              {suspendMutation.isPending ? 'جاري الإيقاف...' : 'إيقاف مؤقت'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Confirm Dialog */}
      <Dialog open={!!bulkConfirm} onOpenChange={() => setBulkConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={bulkConfirm === 'permanent' ? 'text-destructive' : 'text-amber-700'}>
              {bulkConfirm === 'permanent' ? 'حذف نهائي للمحدد' : 'أرشفة المحدد'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {bulkConfirm === 'permanent' ? (
              <>سيتم حذف <strong className="text-foreground">{selectedUsers.length}</strong> مشترك نهائياً من كل قواعد البيانات بدون أي أثر. لا يمكن التراجع.</>
            ) : (
              <>سيتم أرشفة <strong className="text-foreground">{selectedUsers.length}</strong> مشترك. يمكن استعادتهم لاحقاً من قائمة المؤرشفين.</>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirm(null)}>إلغاء</Button>
            <Button
              className={bulkConfirm === 'permanent' ? 'bg-destructive hover:bg-destructive/90 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}
              onClick={() => runBulk(bulkConfirm === 'permanent' ? permanentMutation.mutate : deleteMutation.mutate)}
            >
              {bulkConfirm === 'permanent' ? 'حذف نهائي' : 'أرشفة'} ({selectedUsers.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>أرشفة المشترك</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيتم أرشفة المشترك <strong className="text-foreground">{
              isSalesPage
                ? (users.find(x => x.username === deleteTarget?.username)?.firstName ?? deleteTarget?.username)
                : deleteTarget?.username
            }</strong> وقطع اتصاله ومنعه من تسجيل الدخول. البيانات ستبقى محفوظة ويمكن استعادتها لاحقاً من قائمة "المؤرشفين".
          </p>
          {deleteMutation.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
              {(deleteMutation.error as any)?.response?.data?.message ?? 'تعذّر الحذف'}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
              className="gap-1.5"
            >
              {deleteMutation.isPending ? 'جاري الأرشفة...' : 'أرشفة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Confirm */}
      <Dialog open={!!permanentTarget} onOpenChange={() => setPermanentTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-destructive">حذف نهائي</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيُحذف المشترك <strong className="text-foreground">{
              isSalesPage
                ? (users.find(x => x.username === permanentTarget?.username)?.firstName ?? permanentTarget?.username)
                : permanentTarget?.username
            }</strong> وكل بياناته نهائياً. <span className="text-destructive font-bold">لا يمكن التراجع.</span>
          </p>
          {permanentMutation.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
              {(permanentMutation.error as any)?.response?.data?.message ?? 'تعذّر الحذف'}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermanentTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => permanentTarget && permanentMutation.mutate(permanentTarget)}
              disabled={permanentMutation.isPending}
            >
              {permanentMutation.isPending ? 'جاري الحذف...' : 'حذف نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sales: post-renewal receipt with PNG export */}
      <Dialog open={!!receiptTarget} onOpenChange={() => setReceiptTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>فاتورة تجديد</DialogTitle>
          </DialogHeader>
          <div id="sales-receipt" className="bg-white text-gray-900 p-5 rounded border space-y-3" dir="rtl">
            <div className="text-center border-b pb-3">
              <h2 className="text-xl font-bold">إيصال تجديد اشتراك</h2>
              <p className="text-xs text-gray-500 mt-1">{receiptTarget?.paidAt.toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' })}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-500">اسم المشترك:</div>
              <div className="font-bold text-left">{receiptTarget?.firstName}</div>
              {receiptTarget?.mobile && (<>
                <div className="text-gray-500">رقم الموبايل:</div>
                <div className="font-mono text-left" dir="ltr">{receiptTarget.mobile}</div>
              </>)}
              <div className="text-gray-500">خطة الإنترنت:</div>
              <div className="font-bold text-left">{receiptTarget?.planName}</div>
              <div className="text-gray-500">مدة التجديد:</div>
              <div className="font-bold text-left">{receiptTarget?.days} يوم</div>
              <div className="text-gray-500">ينتهي في:</div>
              <div className="font-bold text-left">{receiptTarget?.expiresAt.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
            {receiptTarget?.price != null && (
              <div className="border-t pt-3 flex items-center justify-between bg-emerald-50 -mx-5 -mb-5 px-5 py-3 rounded-b">
                <span className="text-gray-700 font-medium">المبلغ المدفوع:</span>
                <span className="text-2xl font-black text-emerald-700">{receiptTarget.price.toFixed(2)} ج.م</span>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReceiptTarget(null)}>إغلاق</Button>
            <Button onClick={async () => {
              const node = document.getElementById('sales-receipt')
              if (!node) return
              const html2canvas = (await import('html2canvas')).default
              const canvas = await html2canvas(node, { backgroundColor: '#ffffff', scale: 2 })
              const a = document.createElement('a')
              a.href = canvas.toDataURL('image/png')
              a.download = `receipt-${receiptTarget?.firstName ?? 'subscriber'}-${Date.now()}.png`
              a.click()
            }}>
              حفظ كصورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UserRow({ u, navigate, openEdit, openRenew, setDeleteTarget, setTopupTarget, setClearBonusTarget, expandedBonus, toggleExpandBonus, fmtBytes, onSuspend, onResume, onRestore, onPermanentDelete, perms, isSalesPage, selectable, isSelected, onToggleSelect }: {
  u: RadUser
  navigate: (path: string) => void
  openEdit: (u: RadUser) => void
  openRenew: (u: RadUser) => void
  setTopupTarget: (u: RadUser) => void
  setClearBonusTarget: (t: { user: RadUser; topupId: number; label: string; remainingBytes: number; totalBytes: number }) => void
  setDeleteTarget: (t: { username: string; tenantId: number | null }) => void
  expandedBonus: Set<string>
  toggleExpandBonus: (username: string) => void
  fmtBytes: (b: number) => string
  onSuspend: (t: { username: string; firstName: string; tenantId: number | null }) => void
  onResume: (t: { username: string; tenantId: number | null }) => void
  onRestore: (t: { username: string; tenantId: number | null }) => void
  onPermanentDelete: (t: { username: string; tenantId: number | null }) => void
  perms: { canEdit: boolean; canRenew: boolean; canDelete: boolean; canSuspend: boolean; canTopup: boolean; canViewDetail: boolean }
  isSalesPage: boolean
  selectable: boolean
  isSelected: boolean
  onToggleSelect: () => void
}) {
  const hasMultipleTopups = (u.topups?.length ?? 0) > 1
  const isExpanded = expandedBonus.has(u.username)
  const handleRowClick = (e: React.MouseEvent) => {
    // Don't toggle when clicking on buttons or interactive elements
    const target = e.target as HTMLElement
    if (target.closest('button, a, input')) return
    if (hasMultipleTopups) toggleExpandBonus(u.username)
  }
  return (
    <tr
      className={`border-b hover:bg-muted/30 ${hasMultipleTopups ? 'cursor-pointer' : ''} ${isSelected ? 'bg-primary/5' : ''}`}
      onClick={handleRowClick}
      title={hasMultipleTopups ? (isExpanded ? 'اضغط لطي الباقات الإضافية' : 'اضغط لعرض كل الباقات الإضافية') : undefined}
    >
      {selectable && (
        <td className="py-2 px-3 w-8">
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-primary"
            checked={isSelected}
            onChange={onToggleSelect}
          />
        </td>
      )}
      {!isSalesPage && (
        <td className="py-2 px-3 font-medium font-mono text-xs">
          <span className="inline-flex items-center gap-2">
            {hasMultipleTopups && (isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />)}
            <span dir="ltr">{u.username}</span>
            {u.isArchived ? (
              <Badge className="bg-red-500 text-white border-transparent hover:bg-red-500 px-1.5 py-0 text-[10px]">مؤرشف</Badge>
            ) : u.isSuspended ? (
              <Badge className="bg-amber-500 text-white border-transparent hover:bg-amber-500 px-1.5 py-0 text-[10px]">موقوف</Badge>
            ) : u.isOnline ? (
              <Badge className="bg-green-500 text-white border-transparent hover:bg-green-500 gap-1 px-1.5 py-0 text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full bg-white inline-block animate-pulse" />
                نشط
              </Badge>
            ) : (
              <Badge className="bg-gray-400 text-white border-transparent hover:bg-gray-400 px-1.5 py-0 text-[10px]">غير نشط</Badge>
            )}
          </span>
        </td>
      )}
      <td className="py-2 px-3 text-sm">
        <span className="inline-flex items-center gap-2 flex-wrap">
          {isSalesPage && hasMultipleTopups && (isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />)}
          <span>{u.firstName}</span>
          {isSalesPage && (
            u.isArchived ? (
              <Badge className="bg-red-500 text-white border-transparent hover:bg-red-500 px-1.5 py-0 text-[10px]">مؤرشف</Badge>
            ) : u.isSuspended ? (
              <Badge className="bg-amber-500 text-white border-transparent hover:bg-amber-500 px-1.5 py-0 text-[10px]">موقوف</Badge>
            ) : u.isOnline ? (
              <Badge className="bg-green-500 text-white border-transparent hover:bg-green-500 gap-1 px-1.5 py-0 text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full bg-white inline-block animate-pulse" />
                نشط
              </Badge>
            ) : (
              <Badge className="bg-gray-400 text-white border-transparent hover:bg-gray-400 px-1.5 py-0 text-[10px]">غير نشط</Badge>
            )
          )}
        </span>
      </td>
      <td className="py-2 px-3">
        {u.plan ? (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline">{u.plan.name}</Badge>
            {u.plan.price != null && (
              <span className="text-xs font-bold text-emerald-600 whitespace-nowrap">
                {Number(u.plan.price).toFixed(2)} ج.م
              </span>
            )}
          </span>
        ) : <span className="text-muted-foreground text-xs">—</span>}
      </td>
      <td className="py-2 px-3">
        <span className={`text-sm font-bold ${u.remainingDays <= 0 ? 'text-destructive' : u.remainingDays <= 7 ? 'text-yellow-600' : 'text-green-600'}`}>
          {Math.max(0, u.remainingDays)} يوم{u.remainingDays <= 0 && ' - منتهي'}
        </span>
      </td>
      <td className="py-2 px-3">
        <div className="min-w-[140px] space-y-1">
          {u.remainingDownloadBytes !== null && u.downloadLimitBytes ? (
            <div>
              {(() => {
                const remainingPct = Math.min(100, (u.remainingDownloadBytes / u.downloadLimitBytes) * 100)
                const isExhausted = u.remainingDownloadBytes === 0
                return <>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-sm font-bold ${isExhausted ? 'text-destructive' : 'text-primary'}`}>
                      {fmtBytes(u.remainingDownloadBytes)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">/ {fmtBytes(u.downloadLimitBytes)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-0.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${isExhausted ? 'bg-destructive' : remainingPct < 20 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                      style={{ width: `${remainingPct}%` }}
                    />
                  </div>
                </>
              })()}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">غير محدود</span>
          )}
          {(() => {
            const topups = u.topups ?? []
            if (topups.length === 0) return null
            const visible = isExpanded || topups.length === 1 ? topups : topups.slice(0, 1)
            const hiddenCount = topups.length - visible.length
            return <>
              {visible.map((t, i) => {
                const pct = t.totalBytes > 0 ? Math.min(100, (t.remainingBytes / t.totalBytes) * 100) : 0
                const exhausted = t.remainingBytes === 0
                const daysLeft = t.expiresAt ? Math.max(0, Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / 86400000)) : null
                const expiringSoon = daysLeft !== null && daysLeft <= 3
                return (
                  <div key={t.id} title={`${t.packageName ?? 'باقة #' + (i + 1)}: ${fmtBytes(t.remainingBytes)} من ${fmtBytes(t.totalBytes)}${daysLeft !== null ? ` — تنتهي خلال ${daysLeft} يوم` : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold ${exhausted ? 'text-destructive' : 'text-purple-600'}`}>
                        +{fmtBytes(t.remainingBytes)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">/ {fmtBytes(t.totalBytes)}</span>
                      {daysLeft !== null && (
                        <span className={`text-[10px] ${expiringSoon ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          ⏱{daysLeft}ي
                        </span>
                      )}
                      <button
                        type="button"
                        title={`مسح ${t.packageName ?? 'الباقة'}`}
                        onClick={(e) => { e.stopPropagation(); setClearBonusTarget({ user: u, topupId: t.id, label: t.packageName ?? `باقة #${i + 1}`, remainingBytes: t.remainingBytes, totalBytes: t.totalBytes }) }}
                        className="mr-auto text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-0.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${exhausted ? 'bg-destructive' : pct < 20 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {hiddenCount > 0 && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-1 pt-0.5">
                  <ChevronDown className="h-3 w-3" /> +{hiddenCount} باقة أخرى (اضغط الصف للعرض)
                </div>
              )}
            </>
          })()}
        </div>
      </td>
      <td className="py-2 px-3 text-left whitespace-nowrap">
        {perms.canViewDetail && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 mr-1" title="عرض" onClick={() => navigate(`/users/${u.username}${u.tenantId ? `?tenant=${u.tenantId}` : ''}`)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
        {!u.isArchived && (
          <>
            {perms.canRenew && (
              <Button
                variant="outline" size="sm"
                className="h-7 px-2 text-xs mr-1 gap-1 text-green-700 border-green-300 hover:bg-green-100 hover:text-green-800 hover:border-green-400"
                title="تجديد الاشتراك"
                onClick={() => openRenew(u)}
              >
                <RefreshCw className="h-3 w-3" /> تجديد
              </Button>
            )}
            {perms.canSuspend && (u.isSuspended ? (
              <Button
                variant="outline" size="sm"
                className="h-7 px-2 text-xs mr-1 gap-1 text-green-700 border-green-300 hover:bg-green-100 hover:text-green-800 hover:border-green-400"
                title="تشغيل المشترك"
                onClick={() => onResume({ username: u.username, tenantId: u.tenantId })}
              >
                <Play className="h-3 w-3" /> تشغيل
              </Button>
            ) : (
              <Button
                variant="outline" size="sm"
                className="h-7 px-2 text-xs mr-1 gap-1 text-amber-700 border-amber-300 hover:bg-amber-100 hover:text-amber-800 hover:border-amber-400"
                title="إيقاف مؤقت"
                onClick={() => onSuspend({ username: u.username, firstName: u.firstName, tenantId: u.tenantId })}
              >
                <Pause className="h-3 w-3" /> إيقاف
              </Button>
            ))}
            {perms.canTopup && (
              <Button
                variant="outline" size="sm"
                className="h-7 px-2 text-xs mr-1 gap-1 text-purple-700 border-purple-300 hover:bg-purple-100 hover:text-purple-800 hover:border-purple-400"
                title="إضافة كوتة"
                onClick={() => setTopupTarget(u)}
              >
                <Database className="h-3 w-3" /> +كوتة
              </Button>
            )}
            {perms.canEdit && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 mr-1" title="تعديل" onClick={() => openEdit(u)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {perms.canDelete && (
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700"
                title="أرشفة"
                onClick={() => setDeleteTarget({ username: u.username, tenantId: u.tenantId })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        )}
        {u.isArchived && perms.canDelete && (
          <>
            <Button
              variant="outline" size="sm"
              className="h-7 px-2 text-xs mr-1 gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800 hover:border-emerald-400"
              title="استعادة"
              onClick={() => onRestore({ username: u.username, tenantId: u.tenantId })}
            >
              <ArchiveRestore className="h-3 w-3" /> استعادة
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              title="حذف نهائي"
              onClick={() => onPermanentDelete({ username: u.username, tenantId: u.tenantId })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </td>
    </tr>
  )
}
