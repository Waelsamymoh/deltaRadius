import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download, Upload, DatabaseBackup, ShieldAlert, CheckCircle2, FileJson } from 'lucide-react'
import { backupApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export default function BackupPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  // ── Download ────────────────────────────────────────────────
  const exportMutation = useMutation({
    mutationFn: () => backupApi.export(),
    onSuccess: (res) => {
      const blob = new Blob([res.data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const a = document.createElement('a')
      a.href = url
      a.download = `deltaRadius-backup-${stamp}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
  })

  // ── Restore ─────────────────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: (file: File) => backupApi.import(file),
    onSuccess: (res) => {
      const { tablesRestored, rowsRestored } = res.data ?? {}
      setDoneMsg(`تمت الاستعادة بنجاح: ${tablesRestored} جدول، ${rowsRestored} صف.`)
      setPendingFile(null)
      setConfirmText('')
    },
  })

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setPendingFile(f); setDoneMsg(null) }
    e.target.value = '' // allow re-selecting the same file
  }

  const cancelRestore = () => {
    setPendingFile(null)
    setConfirmText('')
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <DatabaseBackup className="h-7 w-7 text-primary" />
          النسخ الاحتياطي والاستعادة
        </h1>
        <p className="text-muted-foreground mt-1">نسخة احتياطية كاملة لقاعدة بيانات المشروع — للمالك فقط</p>
      </div>

      {doneMsg && (
        <div className="mb-6 flex items-center gap-2 text-sm bg-green-500/10 text-green-600 border border-green-500/30 rounded-lg px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {doneMsg}
        </div>
      )}

      {/* Download backup */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="h-5 w-5 text-blue-500" />
            تنزيل نسخة احتياطية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            يحفظ ملف JSON يحتوي كل بيانات المشروع (الحسابات، العملاء، المشتركين، الخطط، الكروت،
            الجلسات وسجلات المصادقة). احتفظ بالملف في مكان آمن.
          </p>
          <Button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} className="gap-2">
            <Download className="h-4 w-4" />
            {exportMutation.isPending ? 'جاري التحضير...' : 'تنزيل النسخة الآن'}
          </Button>
          {exportMutation.isError && (
            <p className="text-sm text-destructive">
              {(exportMutation.error as any)?.response?.data?.message ?? 'تعذّر إنشاء النسخة'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Restore backup */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5 text-orange-500" />
            استعادة من نسخة احتياطية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 text-sm bg-destructive/10 text-destructive border border-destructive/30 rounded-lg px-4 py-3">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <span>
              تحذير: الاستعادة <strong>تستبدل كل البيانات الحالية بالكامل</strong> بمحتوى الملف.
              هذه العملية لا يمكن التراجع عنها. يُنصح بتنزيل نسخة حالية أولًا.
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={onPickFile}
            className="hidden"
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
            <FileJson className="h-4 w-4" />
            اختر ملف النسخة الاحتياطية (.json)
          </Button>
        </CardContent>
      </Card>

      {/* Confirm restore dialog */}
      <Dialog open={!!pendingFile} onOpenChange={(o) => !o && cancelRestore()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              تأكيد الاستعادة الكاملة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              أنت على وشك استبدال كامل قاعدة البيانات بمحتوى الملف:
            </p>
            <p className="font-mono text-xs bg-muted rounded px-3 py-2 break-all">{pendingFile?.name}</p>
            <p className="text-muted-foreground">
              سيتم حذف كل البيانات الحالية نهائيًا واستبدالها. للمتابعة اكتب كلمة <strong>استعادة</strong> في الحقل أدناه.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="اكتب: استعادة"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {importMutation.isError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
                {(importMutation.error as any)?.response?.data?.message ?? 'تعذّرت الاستعادة'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelRestore} disabled={importMutation.isPending}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={confirmText.trim() !== 'استعادة' || importMutation.isPending}
              onClick={() => pendingFile && importMutation.mutate(pendingFile)}
            >
              {importMutation.isPending ? 'جاري الاستعادة...' : 'استبدال البيانات الآن'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
