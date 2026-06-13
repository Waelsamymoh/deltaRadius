import { useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  CreditCard, Plus, Trash2, Ban, Copy, Check, Printer,
  Search, ChevronLeft, ChevronRight, User, KeyRound, CalendarRange,
  Pencil, Layers, List, Loader2, Settings, ImagePlus, X,
} from 'lucide-react'
import { voucherCardsApi, plansApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

// ── Types ─────────────────────────────────────────────────────────────────────

type Plan = {
  id: number; name: string
  downloadLimitGb: number | null; uploadLimitGb: number | null; totalLimitGb: number | null
}

type VoucherCard = {
  id: number; code: string; status: string; authMode: string
  durationDays: number; startMode: string
  batchName: string | null; expiresAt: string | null; activatedAt: string | null
  createdAt: string; note: string | null
  plan: Plan
  usageDownloadBytes: string; usageUploadBytes: string
}

type Batch = {
  batchName: string; total: number
  unused: number; active: number; expired: number; disabled: number
  createdAt: string; startMode: string; authMode: string
  planName: string; durationDays: number
}

type PagedResult = { data: VoucherCard[]; total: number; page: number; limit: number }

// ── Schemas ───────────────────────────────────────────────────────────────────

const generateSchema = z.object({
  planId:       z.coerce.number().min(1, 'اختر خطة'),
  quantity:     z.coerce.number().min(1).max(1000),
  durationDays: z.coerce.number().min(1),
  startMode:    z.enum(['first_use', 'creation']),
  codeFormat:   z.enum(['numbers', 'letters', 'alphanumeric']),
  codeLength:   z.coerce.number().min(4).max(32),
  authMode:     z.enum(['both', 'username_only']),
  batchName:    z.string().optional(),
  note:         z.string().optional(),
})
type GenerateFormData = z.infer<typeof generateSchema>

const editSchema = z.object({
  planId:       z.coerce.number().min(1),
  durationDays: z.coerce.number().min(1),
  startMode:    z.enum(['first_use', 'creation']),
  authMode:     z.enum(['both', 'username_only']),
  batchName:    z.string().optional(),
  note:         z.string().optional(),
  expiresAt:    z.string().optional(),
})
type EditFormData = z.infer<typeof editSchema>

// ── Constants ─────────────────────────────────────────────────────────────────

const GB = 1024 ** 3

const STATUS_COLORS: Record<string, string> = {
  unused:   'bg-primary/15 text-primary border border-primary/20',
  active:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  expired:  'bg-destructive/15 text-destructive border border-destructive/20',
  disabled: 'bg-muted/50 text-muted-foreground border border-border',
}
const STATUS_LABELS: Record<string, string> = {
  unused: 'غير مستخدم', active: 'نشط', expired: 'منتهي', disabled: 'معطل',
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    } else {
      fallbackCopy(text)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function UsageBar({ card }: { card: VoucherCard }) {
  const plan = card.plan
  const dl = Number(card.usageDownloadBytes)
  const ul = Number(card.usageUploadBytes)

  const renderBar = (used: number, limitGb: number) => {
    const pct = Math.min(100, (used / (limitGb * GB)) * 100)
    const color = pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'
    return (
      <div className="min-w-[100px]">
        <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
          <span>{(used / GB).toFixed(2)}</span>
          <span>{limitGb} GB</span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  if (plan?.totalLimitGb && Number(plan.totalLimitGb) > 0)
    return renderBar(dl + ul, Number(plan.totalLimitGb))
  if (plan?.downloadLimitGb && Number(plan.downloadLimitGb) > 0)
    return renderBar(dl, Number(plan.downloadLimitGb))
  const total = dl + ul
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>
  return <span className="text-xs text-muted-foreground">{(total / GB).toFixed(2)} GB</span>
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CardsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'cards' | 'batches' | 'settings'>('cards')
  const [printLogo, setPrintLogo] = useState<string>(() => localStorage.getItem('cards_print_logo') ?? '')
  const [companyName, setCompanyName] = useState<string>(() => localStorage.getItem('cards_company_name') ?? '')
  const [companyFont, setCompanyFont] = useState<string>(() => localStorage.getItem('cards_company_font') ?? 'Amiri')

  // ── Cards tab state ───────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const LIMIT = 50

  // ── Dialogs ───────────────────────────────────────────────────────────────
  const [generateOpen, setGenerateOpen] = useState(false)
  const [editCard, setEditCard] = useState<VoucherCard | null>(null)
  const [deleteCard, setDeleteCard] = useState<VoucherCard | null>(null)
  const [deleteBatch, setDeleteBatch] = useState<Batch | null>(null)
  const [rangeDialog, setRangeDialog] = useState(false)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [rangeAction, setRangeAction] = useState<'delete' | 'disable'>('delete')
  const [printBatch, setPrintBatch] = useState<Batch | null>(null)
  const [cardsPerPage, setCardsPerPage] = useState(10)
  const [printing, setPrinting] = useState(false)

  // ── Data ──────────────────────────────────────────────────────────────────
  const [searchParams] = useSearchParams()
  const tenantFilter = searchParams.get('tenant') ? Number(searchParams.get('tenant')) : null

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ['plans', { tenant: tenantFilter }],
    queryFn: () => plansApi.list(tenantFilter).then(r => r.data),
  })

  const { data: paged, isLoading: cardsLoading } = useQuery<PagedResult>({
    queryKey: ['voucher-cards', page, search, statusFilter, planFilter, tenantFilter],
    queryFn: () => voucherCardsApi.list({
      page, limit: LIMIT,
      ...(search ? { search } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(planFilter ? { planId: Number(planFilter) } : {}),
      ...(tenantFilter ? { tenantId: tenantFilter } : {}),
    }).then(r => r.data),
    enabled: tab === 'cards',
    refetchInterval: 10_000,
  })

  const { data: batches = [], isLoading: batchesLoading } = useQuery<Batch[]>({
    queryKey: ['voucher-batches', { tenant: tenantFilter }],
    queryFn: () => voucherCardsApi.batches(tenantFilter).then(r => r.data),
    enabled: tab === 'batches',
    refetchInterval: 10_000,
  })

  const cards = paged?.data ?? []
  const total = paged?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  // ── Forms ─────────────────────────────────────────────────────────────────
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<GenerateFormData>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      quantity: 10, durationDays: 30, startMode: 'first_use',
      codeFormat: 'alphanumeric', codeLength: 8, authMode: 'username_only',
    },
  })

  const {
    register: regEdit, handleSubmit: handleEditSubmit,
    reset: resetEdit, formState: { isSubmitting: editSubmitting },
  } = useForm<EditFormData>({ resolver: zodResolver(editSchema) })

  const openEdit = (card: VoucherCard) => {
    setEditCard(card)
    resetEdit({
      planId: card.plan.id,
      durationDays: card.durationDays,
      startMode: card.startMode as any,
      authMode: card.authMode as any,
      batchName: card.batchName ?? '',
      note: card.note ?? '',
      expiresAt: card.expiresAt ? card.expiresAt.substring(0, 10) : '',
    })
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const generateMut = useMutation({
    mutationFn: (dto: GenerateFormData) => voucherCardsApi.generate(dto, tenantFilter).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voucher-cards'] })
      qc.invalidateQueries({ queryKey: ['voucher-batches'] })
      setGenerateOpen(false); reset()
    },
  })

  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditFormData }) =>
      voucherCardsApi.update(id, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['voucher-cards'] }); setEditCard(null) },
  })

  const disableMut = useMutation({
    mutationFn: (id: number) => voucherCardsApi.disable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voucher-cards'] }),
  })

  const deleteCardMut = useMutation({
    mutationFn: (id: number) => voucherCardsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voucher-cards'], refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['voucher-batches'], refetchType: 'all' })
      setDeleteCard(null)
    },
    onError: (err: any) => {
      // eslint-disable-next-line no-console
      console.error('[delete card] failed', err?.response?.status, err?.response?.data)
    },
  })

  const deleteBatchMut = useMutation({
    mutationFn: (name: string) => voucherCardsApi.removeBatch(name, tenantFilter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voucher-cards'] })
      qc.invalidateQueries({ queryKey: ['voucher-batches'] })
      setDeleteBatch(null)
    },
  })

  const rangeDeleteMut = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      voucherCardsApi.removeByRange(from, to, tenantFilter).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voucher-cards'] })
      qc.invalidateQueries({ queryKey: ['voucher-batches'] })
      setRangeDialog(false)
    },
  })

  const rangeDisableMut = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      voucherCardsApi.disableByRange(from, to, tenantFilter).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voucher-cards'] })
      setRangeDialog(false)
    },
  })

  const handleSearch = useCallback(() => { setSearch(searchInput); setPage(1) }, [searchInput])
  const handleFilterChange = (key: 'status' | 'plan', val: string) => {
    if (key === 'status') setStatusFilter(val)
    else setPlanFilter(val)
    setPage(1)
  }

  const executePrint = async (batch: Batch, perPage: number) => {
    setPrinting(true)
    try {
      const res = await voucherCardsApi.batchCards(batch.batchName, tenantFilter)
      const allCards: VoucherCard[] = res.data

      const pages: VoucherCard[][] = []
      for (let i = 0; i < allCards.length; i += perPage) {
        pages.push(allCards.slice(i, i + perPage))
      }

      const cols = perPage <= 2 ? 1 : perPage <= 6 ? 2 : perPage <= 12 ? 3 : 4
      const cardW = cols === 1 ? '100%' : cols === 2 ? '48%' : cols === 3 ? '31%' : '23%'

      const logo    = localStorage.getItem('cards_print_logo') ?? ''
      const cName   = localStorage.getItem('cards_company_name') ?? ''
      const cFont   = localStorage.getItem('cards_company_font') ?? 'Amiri'
      const cardHtml = (c: VoucherCard) => `
        <div class="card">
          ${logo || cName ? `<div class="card-header">
            ${logo   ? `<img src="${logo}" class="logo" alt="logo" />` : ''}
            ${cName  ? `<div class="company">${cName}</div>` : ''}
          </div>` : ''}
          <div class="plan">${c.plan?.name ?? ''}</div>
          <div class="code">${c.code}</div>
          ${c.authMode === 'both' ? `<div class="pw">كلمة المرور: ${c.code}</div>` : ''}
          <div class="dur">${c.durationDays} يوم &nbsp;|&nbsp; ${c.startMode === 'first_use' ? 'من الاستخدام' : 'من الإنشاء'}</div>
        </div>`

      const pageHtml = (page: VoucherCard[], idx: number) => `
        <div class="page">
          <div class="page-header">
            <span>${batch.batchName ?? ''}</span>
            <span>صفحة ${idx + 1} من ${pages.length}</span>
          </div>
          <div class="grid" style="--cols:${cols}">
            ${page.map(cardHtml).join('')}
          </div>
        </div>`

      const win = window.open('', '_blank')!
      win.document.write(`<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8">
<title>طباعة دفعة — ${batch.batchName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Scheherazade+New:wght@400;700&family=Lateef&family=Reem+Kufi:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #fff; direction: rtl; }
  .page {
    width: 210mm;
    padding: 10mm;
    margin: 0 auto;
    page-break-after: always;
    page-break-inside: avoid;
  }
  .page:last-child { page-break-after: avoid; }
  .page-header {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #888;
    border-bottom: 1px solid #ddd;
    padding-bottom: 4mm;
    margin-bottom: 5mm;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(${cols}, 1fr);
    gap: 5mm;
  }
  .card {
    border: 1.5px solid #ccc;
    border-radius: 6px;
    padding: 6mm 5mm;
    text-align: center;
    background: #fff;
    break-inside: avoid;
  }
  .card-header { display: flex; align-items: center; justify-content: center; gap: 3mm; margin-bottom: 2mm; }
  .logo    { height: 28px; width: auto; max-width: 50%; object-fit: contain; flex-shrink: 0; }
  .company { font-family: '${cFont}', serif; font-size: ${cols <= 2 ? 16 : 13}px; color: #222; font-weight: bold; line-height: 1.2; }
  .plan  { font-size: 10px; color: #888; margin-bottom: 2mm; }
  .code  { font-family: 'Courier New', monospace; font-size: ${cols <= 2 ? 22 : cols === 3 ? 16 : 13}px; font-weight: bold; letter-spacing: 2px; margin: 2mm 0; color: #111; word-break: break-all; }
  .pw    { font-size: 9px; color: #555; margin-bottom: 1.5mm; }
  .dur   { font-size: 9px; color: #999; border-top: 1px dashed #ddd; padding-top: 1.5mm; margin-top: 1.5mm; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; width: 100%; }
  }
</style>
</head>
<body>
${pages.map(pageHtml).join('')}
<script>
  window.onload = function() { window.print(); };
<\/script>
</body>
</html>`)
      win.document.close()
    } finally {
      setPrinting(false)
      setPrintBatch(null)
    }
  }

  const printCard = (card: VoucherCard) => {
    const win = window.open('', '_blank')!
    win.document.write(`<html><head><title>بطاقة</title>
      <style>body{font-family:monospace;padding:20px}.card{border:2px solid #333;padding:16px;width:200px;border-radius:8px}.code{font-size:18px;font-weight:bold;letter-spacing:2px;margin:8px 0}.label{font-size:11px;color:#666}</style>
      </head><body><div class="card">
        <div class="label">خطة: ${card.plan?.name ?? ''}</div>
        <div class="code">${card.code}</div>
        ${card.authMode === 'both' ? `<div class="label">كلمة المرور: ${card.code}</div>` : ''}
        <div class="label">المدة: ${card.durationDays} يوم</div>
      </div><script>window.print();window.close();<\/script></body></html>`)
    win.document.close()
  }

  const authModeWatch = watch('authMode')

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">الكروت</h1>
          {tenantFilter && (
            <Link
              to={`/tenants/${tenantFilter}`}
              className="inline-flex items-center gap-1.5 mx-2 text-xs bg-primary/15 text-primary border border-primary/20 px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors"
            >
              العودة للوحة العميل
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRangeDialog(true)} className="gap-2">
            <CalendarRange className="w-4 h-4" />
            بالتاريخ
          </Button>
          <Button onClick={() => setGenerateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            توليد كروت
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('cards')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'cards'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <List className="w-4 h-4" />
          الكروت
          {total > 0 && <span className="bg-primary/15 text-primary text-xs px-1.5 py-0.5 rounded-full">{total}</span>}
        </button>
        <button
          onClick={() => setTab('batches')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'batches'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="w-4 h-4" />
          الدفعات
          {batches.length > 0 && <span className="bg-muted text-foreground/80 text-xs px-1.5 py-0.5 rounded-full">{batches.length}</span>}
        </button>
        <button
          onClick={() => setTab('settings')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'settings'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings className="w-4 h-4" />
          إعدادات الطباعة
          {printLogo && <span className="w-2 h-2 rounded-full bg-emerald-500" title="يوجد لوجو" />}
        </button>
      </div>

      {/* ══ CARDS TAB ══════════════════════════════════════════════════════════ */}
      {tab === 'cards' && (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex gap-2 flex-1 min-w-[200px]">
                  <Input
                    placeholder="بحث بالكود أو الدفعة أو الخطة..."
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={handleSearch}><Search className="w-4 h-4" /></Button>
                </div>
                <select
                  value={statusFilter}
                  onChange={e => handleFilterChange('status', e.target.value)}
                  className="border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground"
                >
                  <option value="">كل الحالات</option>
                  <option value="unused">غير مستخدم</option>
                  <option value="active">نشط</option>
                  <option value="expired">منتهي</option>
                  <option value="disabled">معطل</option>
                </select>
                <select
                  value={planFilter}
                  onChange={e => handleFilterChange('plan', e.target.value)}
                  className="border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground"
                >
                  <option value="">كل الخطط</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {(search || statusFilter || planFilter) && (
                  <Button variant="outline" size="sm" onClick={() => {
                    setSearch(''); setSearchInput(''); setStatusFilter(''); setPlanFilter(''); setPage(1)
                  }}>مسح الفلاتر</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cards Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-right">
                      <th className="px-4 py-3 font-medium text-muted-foreground">الكود</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">الخطة</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">الدفعة</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">المدة</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">الصلاحية</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">المصادقة</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">الاستهلاك</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">تاريخ الإنشاء</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardsLoading ? (
                      <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
                    ) : cards.length === 0 ? (
                      <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">لا توجد كروت</td></tr>
                    ) : cards.map(card => (
                      <tr key={card.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 font-mono font-semibold tracking-wider text-foreground">
                            {card.code}<CopyBtn text={card.code} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground/80">{card.plan?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{card.batchName ?? '—'}</td>
                        <td className="px-4 py-3 text-foreground/80">{card.durationDays} يوم</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[card.status] ?? 'bg-muted/50 text-muted-foreground'}`}>
                            {STATUS_LABELS[card.status] ?? card.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {card.expiresAt ? new Date(card.expiresAt).toLocaleDateString('ar-EG') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {card.authMode === 'username_only'
                            ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><User className="w-3 h-3" />اسم فقط</span>
                            : <span className="flex items-center gap-1 text-xs text-muted-foreground"><KeyRound className="w-3 h-3" />مع كلمة سر</span>
                          }
                        </td>
                        <td className="px-4 py-3"><UsageBar card={card} /></td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {new Date(card.createdAt).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(card)} className="p-1.5 rounded hover:bg-primary/10 text-primary" title="تعديل">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {card.status !== 'used' && card.status !== 'disabled' && (
                              <button onClick={() => disableMut.mutate(card.id)} className="p-1.5 rounded hover:bg-amber-500/10 text-amber-500" title="تعطيل">
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => setDeleteCard(card)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="حذف">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">صفحة {page} من {totalPages} ({total} كرت)</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ══ BATCHES TAB ════════════════════════════════════════════════════════ */}
      {tab === 'batches' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-right">
                    <th className="px-4 py-3 font-medium text-muted-foreground">اسم الدفعة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الخطة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المدة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المصادقة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الإجمالي</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">التفاصيل</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">تاريخ الإنشاء</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {batchesLoading ? (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
                  ) : batches.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد دفعات</td></tr>
                  ) : batches.map(batch => (
                    <tr key={batch.batchName} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{batch.batchName ?? '—'}</td>
                      <td className="px-4 py-3 text-foreground/80">{batch.planName}</td>
                      <td className="px-4 py-3 text-foreground/80">{batch.durationDays} يوم</td>
                      <td className="px-4 py-3">
                        {batch.authMode === 'username_only'
                          ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><User className="w-3 h-3" />اسم فقط</span>
                          : <span className="flex items-center gap-1 text-xs text-muted-foreground"><KeyRound className="w-3 h-3" />مع كلمة سر</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground">{batch.total}</span>
                        <span className="text-muted-foreground text-xs mr-1">كرت</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {batch.unused   > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-primary/15 text-primary border border-primary/20">{batch.unused} غير مستخدم</span>}
                          {batch.active   > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">{batch.active} نشط</span>}
                          {batch.expired  > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-destructive/15 text-destructive border border-destructive/20">{batch.expired} منتهي</span>}
                          {batch.disabled > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-muted/50 text-muted-foreground border border-border">{batch.disabled} معطل</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(batch.createdAt).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setTab('cards')
                              setSearchInput(batch.batchName ?? '')
                              setSearch(batch.batchName ?? '')
                              setPage(1)
                            }}
                            className="p-1.5 rounded hover:bg-primary/10 text-primary"
                            title="عرض الكروت"
                          >
                            <List className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setPrintBatch(batch); setCardsPerPage(10) }}
                            className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-500"
                            title="طباعة الدفعة"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteBatch(batch)}
                            className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                            title="حذف الدفعة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ══ SETTINGS TAB ═══════════════════════════════════════════════════════ */}
      {tab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Logo */}
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">لوجو صفحة الطباعة</h2>
                <p className="text-xs text-muted-foreground mt-0.5">اختياري — يظهر فوق كل كرت عند الطباعة</p>
              </div>

              {printLogo ? (
                <div className="space-y-3">
                  <div className="border border-border rounded-xl p-4 flex items-center gap-3 bg-muted/30">
                    <img src={printLogo} alt="logo" className="h-14 w-14 object-contain rounded-lg border border-border bg-background p-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">اللوجو الحالي</p>
                      <p className="text-xs text-muted-foreground mt-0.5">سيظهر على كل كرت</p>
                    </div>
                    <button onClick={() => { localStorage.removeItem('cards_print_logo'); setPrintLogo('') }}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <label className="cursor-pointer flex items-center gap-1.5 text-sm text-primary hover:underline">
                    <ImagePlus className="w-4 h-4" />تغيير اللوجو
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const file = e.target.files?.[0]; if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => { const b64 = ev.target?.result as string; localStorage.setItem('cards_print_logo', b64); setPrintLogo(b64) }
                      reader.readAsDataURL(file); e.target.value = ''
                    }} />
                  </label>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary hover:bg-primary/5 transition-colors">
                    <ImagePlus className="w-9 h-9 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground">اضغط لرفع اللوجو</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG أو JPG — يفضل خلفية شفافة</p>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => { const b64 = ev.target?.result as string; localStorage.setItem('cards_print_logo', b64); setPrintLogo(b64) }
                    reader.readAsDataURL(file); e.target.value = ''
                  }} />
                </label>
              )}
            </CardContent>
          </Card>

          {/* Company Name */}
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">اسم الشركة</h2>
                <p className="text-xs text-muted-foreground mt-0.5">اختياري — يظهر فوق كل كرت بخط أنيق</p>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-sm">اسم الشركة</Label>
                  <Input
                    value={companyName}
                    onChange={e => { setCompanyName(e.target.value); localStorage.setItem('cards_company_name', e.target.value) }}
                    placeholder="مثال: شركة النور للاتصالات"
                    className="mt-1 text-right"
                    dir="rtl"
                  />
                </div>

                <div>
                  <Label className="text-sm">الخط</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {[
                      { id: 'Amiri',       label: 'أميري',      sample: 'شركة النور' },
                      { id: 'Scheherazade New', label: 'شهرزاد', sample: 'شركة النور' },
                      { id: 'Lateef',      label: 'لطيف',       sample: 'شركة النور' },
                      { id: 'Reem Kufi',   label: 'ريم كوفي',   sample: 'شركة النور' },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => { setCompanyFont(f.id); localStorage.setItem('cards_company_font', f.id) }}
                        className={`border rounded-lg p-2.5 text-center transition-colors ${
                          companyFont === f.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:bg-muted/30'
                        }`}
                      >
                        <div className="text-xs text-muted-foreground mb-1">{f.label}</div>
                        <div style={{ fontFamily: `'${f.id}', serif`, fontSize: 15 }} className="text-foreground leading-snug">
                          {companyName || f.sample}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {companyName && (
                  <div className="border border-border rounded-xl p-3 bg-muted/30 text-center">
                    <p className="text-xs text-muted-foreground mb-1">معاينة على الكرت</p>
                    <div style={{ fontFamily: `'${companyFont}', serif`, fontSize: 18 }} className="text-foreground">
                      {companyName}
                    </div>
                  </div>
                )}

                {companyName && (
                  <button onClick={() => { setCompanyName(''); localStorage.removeItem('cards_company_name') }}
                    className="text-xs text-destructive hover:underline flex items-center gap-1">
                    <X className="w-3 h-3" />حذف اسم الشركة
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

        </div>
      )}

      {/* ══ DIALOGS ════════════════════════════════════════════════════════════ */}

      {/* Generate */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>توليد كروت جديدة</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(d => generateMut.mutateAsync(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>الخطة</Label>
                <select {...register('planId', { valueAsNumber: true })} className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm mt-1">
                  <option value="">اختر خطة</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {errors.planId && <p className="text-destructive text-xs mt-1">{errors.planId.message}</p>}
              </div>
              <div>
                <Label>الكمية</Label>
                <Input type="number" min={1} max={1000} {...register('quantity')} className="mt-1" />
              </div>
              <div>
                <Label>المدة (أيام)</Label>
                <Input type="number" min={1} {...register('durationDays')} className="mt-1" />
              </div>
              <div>
                <Label>صيغة الكود</Label>
                <select {...register('codeFormat')} className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm mt-1">
                  <option value="alphanumeric">أرقام وحروف</option>
                  <option value="numbers">أرقام فقط</option>
                  <option value="letters">حروف فقط</option>
                </select>
              </div>
              <div>
                <Label>طول الكود</Label>
                <Input type="number" min={4} max={32} {...register('codeLength')} className="mt-1" />
              </div>
              <div>
                <Label>بداية الصلاحية</Label>
                <select {...register('startMode')} className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm mt-1">
                  <option value="first_use">عند الاستخدام الأول</option>
                  <option value="creation">من الإنشاء</option>
                </select>
              </div>
              <div>
                <Label>طريقة المصادقة</Label>
                <select {...register('authMode')} className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm mt-1">
                  <option value="both">اسم + كلمة مرور</option>
                  <option value="username_only">اسم فقط</option>
                </select>
              </div>
              <div className="col-span-2">
                <Label>اسم الدفعة (اختياري)</Label>
                <Input {...register('batchName')} placeholder="مثال: دفعة يناير 2025" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>ملاحظة (اختياري)</Label>
                <Input {...register('note')} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGenerateOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={generateMut.isPending}>
                {generateMut.isPending ? 'جاري التوليد...' : 'توليد'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Card */}
      <Dialog open={!!editCard} onOpenChange={() => setEditCard(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل الكرت — <span className="font-mono text-base">{editCard?.code}</span></DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit(d => editMut.mutateAsync({ id: editCard!.id, data: d }))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>الخطة</Label>
                <select {...regEdit('planId', { valueAsNumber: true })} className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm mt-1">
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <Label>المدة (أيام)</Label>
                <Input type="number" min={1} {...regEdit('durationDays')} className="mt-1" />
              </div>
              <div>
                <Label>بداية الصلاحية</Label>
                <select {...regEdit('startMode')} className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm mt-1">
                  <option value="first_use">عند الاستخدام الأول</option>
                  <option value="creation">من الإنشاء</option>
                </select>
              </div>
              <div>
                <Label>طريقة المصادقة</Label>
                <select {...regEdit('authMode')} className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm mt-1">
                  <option value="both">اسم + كلمة مرور</option>
                  <option value="username_only">اسم فقط</option>
                </select>
              </div>
              <div>
                <Label>تاريخ الانتهاء</Label>
                <Input type="date" {...regEdit('expiresAt')} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>اسم الدفعة</Label>
                <Input {...regEdit('batchName')} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>ملاحظة</Label>
                <Input {...regEdit('note')} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditCard(null)}>إلغاء</Button>
              <Button type="submit" disabled={editSubmitting || editMut.isPending}>
                {editMut.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete single card */}
      <Dialog open={!!deleteCard} onOpenChange={() => setDeleteCard(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف الكرت <span className="font-mono font-bold text-foreground">{deleteCard?.code}</span>؟
            سيتم حذفه من FreeRADIUS أيضاً.
          </p>
          {deleteCardMut.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
              {(deleteCardMut.error as any)?.response?.data?.message ?? 'تعذّر الحذف'}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCard(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => {
              // eslint-disable-next-line no-console
              console.log('[delete card] click — id:', deleteCard?.id)
              if (deleteCard) deleteCardMut.mutate(deleteCard.id)
            }} disabled={deleteCardMut.isPending}>
              {deleteCardMut.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete batch */}
      <Dialog open={!!deleteBatch} onOpenChange={() => setDeleteBatch(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>حذف الدفعة</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف دفعة <span className="font-semibold text-foreground">"{deleteBatch?.batchName}"</span> بالكامل؟
            <br />سيتم حذف <span className="font-bold text-destructive">{deleteBatch?.total} كرت</span> نهائياً من قاعدة البيانات وFreeRADIUS.
          </p>
          {deleteBatchMut.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
              {(deleteBatchMut.error as any)?.response?.data?.message ?? 'تعذّر الحذف'}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBatch(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteBatch && deleteBatchMut.mutate(deleteBatch.batchName)}
              disabled={deleteBatchMut.isPending}
            >
              {deleteBatchMut.isPending ? 'جاري الحذف...' : `حذف ${deleteBatch?.total} كرت`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Batch Dialog */}
      <Dialog open={!!printBatch} onOpenChange={() => setPrintBatch(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-emerald-500" />
              طباعة دفعة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="p-3 bg-muted/30 border border-border rounded-lg text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الدفعة</span>
                <span className="font-semibold text-foreground">{printBatch?.batchName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي الكروت</span>
                <span className="font-semibold text-foreground">{printBatch?.total} كرت</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">عدد الصفحات</span>
                <span className="font-semibold text-primary">
                  {printBatch ? Math.ceil(printBatch.total / cardsPerPage) : 0} صفحة
                </span>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">كم كرت في الصفحة الواحدة؟</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[4, 6, 9, 12, 15, 20, 25, 30].map(n => (
                  <button
                    key={n}
                    onClick={() => setCardsPerPage(n)}
                    className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                      cardsPerPage === n
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-foreground/80 hover:bg-muted/30'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Label className="text-sm text-muted-foreground shrink-0">أو أدخل رقماً:</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={cardsPerPage}
                  onChange={e => setCardsPerPage(Math.max(1, Number(e.target.value)))}
                  className="w-24"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintBatch(null)}>إلغاء</Button>
            <Button
              className="gap-2"
              disabled={printing}
              onClick={() => printBatch && executePrint(printBatch, cardsPerPage)}
            >
              {printing
                ? <><Loader2 className="w-4 h-4 animate-spin" />جاري التحضير...</>
                : <><Printer className="w-4 h-4" />طباعة</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date Range */}
      <Dialog open={rangeDialog} onOpenChange={setRangeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تعديل/حذف كروت بالتاريخ</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <Label>من تاريخ</Label>
                <Input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} className="mt-1" />
              </div>
              <div className="flex-1">
                <Label>إلى تاريخ</Label>
                <Input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRangeAction('disable')}
                className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                  rangeAction === 'disable'
                    ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                    : 'border-border text-muted-foreground hover:bg-muted/30'
                }`}
              >تعطيل</button>
              <button
                onClick={() => setRangeAction('delete')}
                className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                  rangeAction === 'delete'
                    ? 'bg-destructive/10 border-destructive text-destructive'
                    : 'border-border text-muted-foreground hover:bg-muted/30'
                }`}
              >حذف نهائي</button>
            </div>
            {rangeAction === 'delete' && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2 rounded">
                سيتم حذف جميع الكروت في هذا النطاق نهائياً من قاعدة البيانات وFreeRADIUS.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRangeDialog(false)}>إلغاء</Button>
            <Button
              variant={rangeAction === 'delete' ? 'destructive' : 'default'}
              disabled={!rangeFrom || !rangeTo || rangeDeleteMut.isPending || rangeDisableMut.isPending}
              onClick={() => {
                if (!rangeFrom || !rangeTo) return
                if (rangeAction === 'delete') rangeDeleteMut.mutate({ from: rangeFrom, to: rangeTo })
                else rangeDisableMut.mutate({ from: rangeFrom, to: rangeTo })
              }}
            >
              {(rangeDeleteMut.isPending || rangeDisableMut.isPending) ? 'جاري التنفيذ...' : rangeAction === 'delete' ? 'حذف' : 'تعطيل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
