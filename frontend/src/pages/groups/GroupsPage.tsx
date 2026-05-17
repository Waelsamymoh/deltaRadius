import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Group, ChevronDown, ChevronRight } from 'lucide-react'
import { groupsApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

const schema = z.object({
  groupName: z.string().min(1, 'مطلوب'),
  checkAttributes: z.array(z.object({
    attribute: z.string().min(1, 'مطلوب'),
    op: z.string().min(1, 'مطلوب'),
    value: z.string().min(1, 'مطلوب'),
  })).optional(),
  replyAttributes: z.array(z.object({
    attribute: z.string().min(1, 'مطلوب'),
    op: z.string().min(1, 'مطلوب'),
    value: z.string().min(1, 'مطلوب'),
  })).optional(),
})
type FormData = z.infer<typeof schema>

type GroupDetail = {
  groupName: string
  checkAttributes: { attribute: string; op: string; value: string }[]
  replyAttributes: { attribute: string; op: string; value: string }[]
}

export default function GroupsPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [checkAttrs, setCheckAttrs] = useState([{ attribute: '', op: ':=', value: '' }])
  const [replyAttrs, setReplyAttrs] = useState([{ attribute: '', op: ':=', value: '' }])

  const { data: groups = [], isLoading } = useQuery<GroupDetail[]>({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list().then(r => r.data),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (data: { groupName: string; checkAttributes: typeof checkAttrs; replyAttributes: typeof replyAttrs }) =>
      groupsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); closeDialog() },
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => groupsApi.remove(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setDeleteTarget(null) },
  })

  const openCreate = () => {
    reset({ groupName: '' })
    setCheckAttrs([{ attribute: '', op: ':=', value: '' }])
    setReplyAttrs([{ attribute: '', op: ':=', value: '' }])
    setOpen(true)
  }

  const closeDialog = () => { setOpen(false); reset() }

  const onSubmit = (data: FormData) => {
    createMutation.mutate({
      groupName: data.groupName,
      checkAttributes: checkAttrs.filter(a => a.attribute),
      replyAttributes: replyAttrs.filter(a => a.attribute),
    })
  }

  const addCheckAttr = () => setCheckAttrs(p => [...p, { attribute: '', op: ':=', value: '' }])
  const addReplyAttr = () => setReplyAttrs(p => [...p, { attribute: '', op: ':=', value: '' }])

  const updateAttr = (
    list: typeof checkAttrs,
    setList: typeof setCheckAttrs,
    i: number,
    field: string,
    val: string
  ) => {
    const copy = [...list]
    copy[i] = { ...copy[i], [field]: val }
    setList(copy)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Group className="h-7 w-7" /> المجموعات
          </h1>
          <p className="text-muted-foreground mt-1">إدارة مجموعات المستخدمين وصلاحياتهم</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> مجموعة جديدة
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            المجموعات <Badge variant="secondary" className="ml-2">{groups.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : groups.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد مجموعات بعد</p>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => (
                <div key={g.groupName} className="border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 cursor-pointer"
                    onClick={() => setExpanded(expanded === g.groupName ? null : g.groupName)}
                  >
                    <div className="flex items-center gap-3">
                      {expanded === g.groupName
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium">{g.groupName}</span>
                      <Badge variant="outline" className="text-xs">{g.checkAttributes.length + g.replyAttributes.length} سمة</Badge>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(g.groupName) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {expanded === g.groupName && (
                    <div className="border-t px-4 py-3 bg-muted/10 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">سمات التحقق (Check)</p>
                        {g.checkAttributes.length === 0
                          ? <p className="text-xs text-muted-foreground">لا شيء</p>
                          : g.checkAttributes.map((a, i) => (
                            <div key={i} className="text-xs font-mono bg-muted rounded px-2 py-1 mb-1">
                              {a.attribute} {a.op} {a.value}
                            </div>
                          ))}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">سمات الرد (Reply)</p>
                        {g.replyAttributes.length === 0
                          ? <p className="text-xs text-muted-foreground">لا شيء</p>
                          : g.replyAttributes.map((a, i) => (
                            <div key={i} className="text-xs font-mono bg-muted rounded px-2 py-1 mb-1">
                              {a.attribute} {a.op} {a.value}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إنشاء مجموعة جديدة</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1">
              <Label>اسم المجموعة</Label>
              <Input {...register('groupName')} placeholder="premium-users" />
              {errors.groupName && <p className="text-xs text-destructive">{errors.groupName.message}</p>}
            </div>

            {/* Check Attributes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">سمات التحقق (Check Attributes)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCheckAttr}>+ إضافة</Button>
              </div>
              {checkAttrs.map((a, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                  <Input value={a.attribute} onChange={e => updateAttr(checkAttrs, setCheckAttrs, i, 'attribute', e.target.value)} placeholder="Auth-Type" />
                  <Input value={a.op} onChange={e => updateAttr(checkAttrs, setCheckAttrs, i, 'op', e.target.value)} placeholder=":=" className="max-w-[80px]" />
                  <Input value={a.value} onChange={e => updateAttr(checkAttrs, setCheckAttrs, i, 'value', e.target.value)} placeholder="Local" />
                </div>
              ))}
            </div>

            {/* Reply Attributes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">سمات الرد (Reply Attributes)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addReplyAttr}>+ إضافة</Button>
              </div>
              {replyAttrs.map((a, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                  <Input value={a.attribute} onChange={e => updateAttr(replyAttrs, setReplyAttrs, i, 'attribute', e.target.value)} placeholder="Session-Timeout" />
                  <Input value={a.op} onChange={e => updateAttr(replyAttrs, setReplyAttrs, i, 'op', e.target.value)} placeholder=":=" className="max-w-[80px]" />
                  <Input value={a.value} onChange={e => updateAttr(replyAttrs, setReplyAttrs, i, 'value', e.target.value)} placeholder="3600" />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                {createMutation.isPending ? 'جاري الحفظ...' : 'إنشاء'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف المجموعة <strong>{deleteTarget}</strong>؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
