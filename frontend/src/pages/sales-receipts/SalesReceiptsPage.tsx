import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Receipt, Calendar, User, TrendingUp, ChevronDown, FileSpreadsheet, Printer, Trash2 } from 'lucide-react'
import { salesReceiptsApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth.store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Receipt = {
  id: number
  adminId: number | null
  adminEmail: string | null
  adminName: string | null
  username: string
  subscriberName: string | null
  planName: string | null
  price: string | null
  daysRenewed: number
  paidAt: string
}

type AdminSummary = {
  adminId: number
  adminEmail: string
  adminName: string | null
  count: number
  totalPrice: string
}

export default function SalesReceiptsPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'owner'
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')
  const [filterAdmin, setFilterAdmin] = useState<number | ''>('')

  // Collapsible year/month grouping — current year + month open by default.
  const _now = new Date()
  const [openYears, setOpenYears]   = useState<Set<number>>(new Set([_now.getFullYear()]))
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set([`${_now.getFullYear()}-${_now.getMonth() + 1}`]))
  const toggleYear  = (y: number) => setOpenYears(p => { const n = new Set(p); n.has(y) ? n.delete(y) : n.add(y); return n })
  const toggleMonth = (k: string) => setOpenMonths(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

  const listQ = useQuery<Receipt[]>({
    queryKey: ['sales-receipts', { from, to, filterAdmin }],
    queryFn: () => salesReceiptsApi.list({
      from: from || undefined,
      to:   to   || undefined,
      adminId: filterAdmin === '' ? undefined : filterAdmin as number,
    }).then(r => r.data),
  })

  const summaryQ = useQuery<AdminSummary[]>({
    queryKey: ['sales-receipts', 'summary', { from, to }],
    queryFn: () => salesReceiptsApi.summary({
      from: from || undefined,
      to:   to   || undefined,
    }).then(r => r.data),
    enabled: isAdmin,
  })

  const qc = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: (id: number) => salesReceiptsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-receipts'] }),
  })

  const receipts = listQ.data ?? []
  const summary  = summaryQ.data ?? []

  const grandTotal = receipts.reduce((s, r) => s + Number(r.price ?? 0), 0)

  // Group receipts: year → month → receipts[]
  const byYear = new Map<number, Map<number, Receipt[]>>()
  for (const r of receipts) {
    const d = new Date(r.paidAt)
    const y = d.getFullYear(), m = d.getMonth() + 1
    if (!byYear.has(y)) byYear.set(y, new Map())
    const months = byYear.get(y)!
    if (!months.has(m)) months.set(m, [])
    months.get(m)!.push(r)
  }
  const years = [...byYear.keys()].sort((a, b) => b - a)
  const sumPrice = (rows: Receipt[]) => rows.reduce((s, r) => s + Number(r.price ?? 0), 0)

  // Detect duplicate receipts: same subscriber more than once within the SAME month.
  const monthKeyOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth() + 1}` }
  const dupCount = new Map<string, number>()
  for (const r of receipts) {
    const k = `${r.username}|${monthKeyOf(r.paidAt)}`
    dupCount.set(k, (dupCount.get(k) ?? 0) + 1)
  }
  const isDup = (r: Receipt) => (dupCount.get(`${r.username}|${monthKeyOf(r.paidAt)}`) ?? 0) > 1

  // ── Selection (for bulk delete / print) ─────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const toggleSel = (id: number) =>
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const setManySel = (ids: number[], on: boolean) =>
    setSelected(p => { const n = new Set(p); ids.forEach(id => on ? n.add(id) : n.delete(id)); return n })
  const selectedRows = receipts.filter(r => selected.has(r.id))

  // Shared: build the title + HTML table for a set of rows (Excel + Print).
  const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const tableHtml = (title: string, rows: Receipt[]) => {
    const heads = ['التاريخ', 'المشترك', 'الخطة', 'المدة (يوم)', ...(isAdmin ? ['المشرف'] : []), 'المبلغ (ج.م)']
    const total = sumPrice(rows).toFixed(2)
    let body = ''
    for (const r of rows) {
      const cells = [
        new Date(r.paidAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }),
        r.subscriberName ?? r.username,
        r.planName ?? '',
        r.daysRenewed,
        ...(isAdmin ? [r.adminName || r.adminEmail || ''] : []),
        r.price != null ? Number(r.price).toFixed(2) : '',
      ]
      const bg = isDup(r) ? ' bgcolor="#FFF3CD"' : ''
      body += `<tr${bg}>` + cells.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>'
    }
    return `<table dir="rtl">` +
      `<tr><th colspan="${heads.length}" class="title">${esc(title)}</th></tr>` +
      `<tr>${heads.map(h => `<th>${esc(h)}</th>`).join('')}</tr>` +
      body +
      `<tr><th colspan="${heads.length - 1}" style="text-align:left">الإجمالي</th><th>${total}</th></tr>` +
      `</table>`
  }

  // Export rows to an Excel-openable .xls (no library).
  const exportXls = (filename: string, title: string, rows: Receipt[]) => {
    const html =
      `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">` +
      `<style>table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px;font-size:13px}` +
      `th{background:#f0f0f0}.title{font-size:16px;background:#dff0d8}</style></head><body>` +
      tableHtml(title, rows) + `</body></html>`
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  // Print rows in a clean printable window.
  const printRows = (title: string, rows: Receipt[]) => {
    const html =
      `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
      `<style>body{font-family:Arial,'Segoe UI',sans-serif;padding:20px;color:#111}` +
      `table{border-collapse:collapse;width:100%}` +
      `td,th{border:1px solid #999;padding:6px 10px;font-size:13px;text-align:right}` +
      `th{background:#f0f0f0}.title{font-size:18px;background:#dff0d8;text-align:center}` +
      `</style></head><body>` +
      tableHtml(title, rows) +
      `<script>window.onload=function(){window.print()}<\/script></body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.open(); w.document.write(html); w.document.close()
  }

  const exportMonthXls = (year: number, month: number, rows: Receipt[]) =>
    exportXls(`فواتير-${monthNames[month - 1]}-${year}.xls`, `فواتير المبيعات — ${monthNames[month - 1]} ${year}`, rows)
  const printMonth = (year: number, month: number, rows: Receipt[]) =>
    printRows(`فواتير المبيعات — ${monthNames[month - 1]} ${year}`, rows)

  const bulkDelete = async () => {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`حذف ${ids.length} فاتورة محددة؟`)) return
    await Promise.all(ids.map(id => salesReceiptsApi.remove(id)))
    qc.invalidateQueries({ queryKey: ['sales-receipts'] })
    setSelected(new Set())
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Receipt className="h-7 w-7" /> فواتير المبيعات
        </h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin
            ? 'كل عمليات تجديد المشتركين التي نفّذها فريق المبيعات'
            : 'كل عمليات التجديد التي نفّذتها أنت'}
        </p>
      </div>

      {/* Date filters */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">من تاريخ</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="border border-input bg-background rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="border border-input bg-background rounded-md px-3 py-2 text-sm"
            />
          </div>
          {isAdmin && summary.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">المشرف</label>
              <select
                value={filterAdmin}
                onChange={e => setFilterAdmin(e.target.value === '' ? '' : Number(e.target.value))}
                className="border border-input bg-background rounded-md px-3 py-2 text-sm"
              >
                <option value="">— الكل —</option>
                {summary.map(s => (
                  <option key={s.adminId} value={s.adminId}>
                    {s.adminName || s.adminEmail}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="ml-auto text-sm">
            إجمالي المعروض: <span className="font-bold text-emerald-600">{grandTotal.toFixed(2)} ج.م</span>
            <span className="text-muted-foreground mr-2">({receipts.length} فاتورة)</span>
          </div>
        </CardContent>
      </Card>

      {/* Per-supervisor summary — admin only */}
      {isAdmin && summary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> ملخص حسب المشرف
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.map(s => (
                <div
                  key={s.adminId}
                  className="rounded-md border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition"
                  onClick={() => setFilterAdmin(s.adminId)}
                >
                  <div className="font-bold text-sm">{s.adminName || s.adminEmail}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">{s.adminEmail}</div>
                  <div className="flex items-center justify-between mt-2">
                    <Badge variant="secondary">{s.count} فاتورة</Badge>
                    <span className="text-lg font-black text-emerald-600">
                      {Number(s.totalPrice).toFixed(2)} ج.م
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-sm sticky top-2 z-10">
          <span className="font-semibold text-primary">{selected.size} فاتورة محددة</span>
          <span className="text-muted-foreground">الإجمالي: {sumPrice(selectedRows).toFixed(2)} ج.م</span>
          <div className="flex gap-2 mr-auto">
            <button
              onClick={() => printRows('الفواتير المحددة', selectedRows)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" /> طباعة المحدد
            </button>
            <button
              onClick={() => exportXls('فواتير-محددة.xls', 'الفواتير المحددة', selectedRows)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> إكسل المحدد
            </button>
            {isAdmin && (
              <button
                onClick={bulkDelete}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> حذف المحدد
              </button>
            )}
            <button onClick={() => setSelected(new Set())} className="text-xs px-2.5 py-1.5 rounded-md border border-input hover:bg-muted transition-colors">
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* Receipts grouped by year → month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> الفواتير حسب السنة والشهر
            </span>
            <span className="text-xs font-normal text-muted-foreground inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded bg-amber-500/30 border border-amber-500/40" />
              فاتورة مكررة لنفس المشترك خلال نفس الشهر
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : receipts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد فواتير ضمن الفترة المحددة</p>
          ) : (
            <div className="space-y-3">
              {years.map(year => {
                const months = byYear.get(year)!
                const monthKeys = [...months.keys()].sort((a, b) => b - a)
                const yearRows = monthKeys.flatMap(m => months.get(m)!)
                const yearOpen = openYears.has(year)
                return (
                  <div key={year} className="border rounded-xl overflow-hidden">
                    {/* Year header */}
                    <button
                      onClick={() => toggleYear(year)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-right"
                    >
                      <div className="flex items-center gap-2.5">
                        <ChevronDown className={`h-4 w-4 transition-transform ${yearOpen ? '' : '-rotate-90'}`} />
                        <span className="font-bold text-base">{year}</span>
                        <Badge variant="outline">{yearRows.length} فاتورة</Badge>
                      </div>
                      <span className="font-black text-emerald-600">{sumPrice(yearRows).toFixed(2)} ج.م</span>
                    </button>

                    {yearOpen && (
                      <div className="p-2 space-y-2">
                        {monthKeys.map(m => {
                          const rows = months.get(m)!
                          const key = `${year}-${m}`
                          const monthOpen = openMonths.has(key)
                          return (
                            <div key={key} className="border rounded-lg overflow-hidden">
                              {/* Month header */}
                              <div className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-muted/15">
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 cursor-pointer accent-primary"
                                    title="تحديد كل فواتير الشهر"
                                    checked={rows.length > 0 && rows.every(r => selected.has(r.id))}
                                    onChange={e => setManySel(rows.map(r => r.id), e.target.checked)}
                                  />
                                  <button onClick={() => toggleMonth(key)} className="flex items-center gap-2 flex-1 text-right hover:opacity-80 transition-opacity">
                                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${monthOpen ? '' : '-rotate-90'}`} />
                                    <span className="font-semibold text-sm">{monthNames[m - 1]}</span>
                                    <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
                                  </button>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-bold text-sm text-emerald-600">{sumPrice(rows).toFixed(2)} ج.م</span>
                                  <button
                                    onClick={() => exportMonthXls(year, m, rows)}
                                    title="تصدير إكسل"
                                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                                  >
                                    <FileSpreadsheet className="h-3.5 w-3.5" /> إكسل
                                  </button>
                                  <button
                                    onClick={() => printMonth(year, m, rows)}
                                    title="طباعة"
                                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                                  >
                                    <Printer className="h-3.5 w-3.5" /> طباعة
                                  </button>
                                </div>
                              </div>

                              {monthOpen && (
                                <div className="overflow-x-auto border-t">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b text-muted-foreground bg-muted/10">
                                        <th className="py-2 px-3 w-8">
                                          <input
                                            type="checkbox"
                                            className="h-4 w-4 cursor-pointer accent-primary"
                                            checked={rows.length > 0 && rows.every(r => selected.has(r.id))}
                                            onChange={e => setManySel(rows.map(r => r.id), e.target.checked)}
                                          />
                                        </th>
                                        <th className="text-right py-2 px-3 font-medium">التاريخ</th>
                                        <th className="text-right py-2 px-3 font-medium">المشترك</th>
                                        <th className="text-right py-2 px-3 font-medium">الخطة</th>
                                        <th className="text-right py-2 px-3 font-medium">المدة</th>
                                        {isAdmin && <th className="text-right py-2 px-3 font-medium">المشرف</th>}
                                        <th className="text-left py-2 px-3 font-medium">المبلغ</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.map(r => (
                                        <tr key={r.id} className={`border-b last:border-0 transition-colors ${selected.has(r.id) ? 'bg-primary/10' : isDup(r) ? 'bg-amber-500/15 hover:bg-amber-500/25' : 'hover:bg-muted/30'}`}>
                                          <td className="py-2 px-3">
                                            <input
                                              type="checkbox"
                                              className="h-4 w-4 cursor-pointer accent-primary"
                                              checked={selected.has(r.id)}
                                              onChange={() => toggleSel(r.id)}
                                            />
                                          </td>
                                          <td className="py-2 px-3 text-xs">
                                            {new Date(r.paidAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                                          </td>
                                          <td className="py-2 px-3 font-medium">
                                            <span className="flex items-center gap-2">
                                              {r.subscriberName ?? r.username}
                                              {isDup(r) && (
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-500/20 border border-amber-500/30 rounded px-1.5 py-0.5">مكرر</span>
                                              )}
                                            </span>
                                          </td>
                                          <td className="py-2 px-3">
                                            {r.planName
                                              ? <Badge variant="outline">{r.planName}</Badge>
                                              : <span className="text-muted-foreground">—</span>}
                                          </td>
                                          <td className="py-2 px-3 text-xs">{r.daysRenewed} يوم</td>
                                          {isAdmin && (
                                            <td className="py-2 px-3 text-xs">
                                              <span className="inline-flex items-center gap-1">
                                                <User className="h-3 w-3 text-muted-foreground" />
                                                {r.adminName || r.adminEmail || '—'}
                                              </span>
                                            </td>
                                          )}
                                          <td className="py-2 px-3 text-left font-bold text-emerald-600">
                                            <div className="flex items-center justify-end gap-2">
                                              <span>{r.price != null ? `${Number(r.price).toFixed(2)} ج.م` : '—'}</span>
                                              {isAdmin && (
                                                <button
                                                  onClick={() => {
                                                    if (confirm(`حذف فاتورة "${r.subscriberName ?? r.username}" بتاريخ ${new Date(r.paidAt).toLocaleDateString('ar-EG')}؟`))
                                                      deleteMutation.mutate(r.id)
                                                  }}
                                                  disabled={deleteMutation.isPending}
                                                  title="حذف الفاتورة"
                                                  className="text-destructive hover:bg-destructive/10 rounded p-1 transition-colors disabled:opacity-50"
                                                >
                                                  <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
