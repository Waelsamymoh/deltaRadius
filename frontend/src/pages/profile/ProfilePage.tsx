import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserCog, KeyRound, CheckCircle2 } from 'lucide-react'
import { authApi } from '@/api/endpoints'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const infoSchema = z.object({
  email: z.string().min(3, 'على الأقل 3 أحرف').regex(/^[a-zA-Z0-9_.-]+$/, 'أحرف إنجليزية وأرقام فقط'),
  fullName: z.string().optional(),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'مطلوب'),
  newPassword: z.string().min(6, 'على الأقل 6 أحرف'),
  confirmPassword: z.string().min(1, 'مطلوب'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
})

type InfoForm = z.infer<typeof infoSchema>
type PasswordForm = z.infer<typeof passwordSchema>

export default function ProfilePage() {
  const { user, updateSession } = useAuthStore()
  const [infoSuccess, setInfoSuccess] = useState(false)
  const [passSuccess, setPassSuccess] = useState(false)

  const infoForm = useForm<InfoForm>({
    resolver: zodResolver(infoSchema),
    defaultValues: { email: user?.email ?? '', fullName: user?.fullName ?? '' },
  })

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const infoMutation = useMutation({
    mutationFn: (data: InfoForm) => authApi.updateProfile(data),
    onSuccess: (res) => {
      updateSession(res.data.user, res.data.access_token)
      setInfoSuccess(true)
      setTimeout(() => setInfoSuccess(false), 3000)
    },
  })

  const passwordMutation = useMutation({
    mutationFn: (data: PasswordForm) =>
      authApi.updateProfile({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
    onSuccess: (res) => {
      updateSession(res.data.user, res.data.access_token)
      passwordForm.reset()
      setPassSuccess(true)
      setTimeout(() => setPassSuccess(false), 3000)
    },
  })

  return (
    <div className="p-8 max-w-xl" dir="rtl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <UserCog className="h-7 w-7" /> الملف الشخصي
        </h1>
        <p className="text-muted-foreground mt-1">تعديل بيانات حسابك</p>
      </div>

      {/* Info card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="h-4 w-4" /> البيانات الأساسية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={infoForm.handleSubmit(d => infoMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>اسم الدخول</Label>
              <Input {...infoForm.register('email')} dir="ltr" className="text-left" placeholder="admin1" />
              <p className="text-xs text-muted-foreground">أحرف إنجليزية وأرقام فقط (a-z, 0-9, _ . -)</p>
              {infoForm.formState.errors.email && (
                <p className="text-xs text-destructive">{infoForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>الاسم الكامل</Label>
              <Input {...infoForm.register('fullName')} placeholder="اسمك الكامل" />
            </div>
            {infoMutation.isError && (
              <p className="text-xs text-destructive">
                {(infoMutation.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={infoMutation.isPending}>
                {infoMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
              {infoSuccess && (
                <span className="flex items-center gap-1 text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4" /> تم الحفظ
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> تغيير كلمة المرور
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(d => passwordMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>كلمة المرور الحالية</Label>
              <Input type="password" {...passwordForm.register('currentPassword')} placeholder="••••••••" />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>كلمة المرور الجديدة</Label>
              <Input type="password" {...passwordForm.register('newPassword')} placeholder="••••••••" />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>تأكيد كلمة المرور الجديدة</Label>
              <Input type="password" {...passwordForm.register('confirmPassword')} placeholder="••••••••" />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            {passwordMutation.isError && (
              <p className="text-xs text-destructive">
                {(passwordMutation.error as any)?.response?.data?.message ?? 'حدث خطأ'}
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
              </Button>
              {passSuccess && (
                <span className="flex items-center gap-1 text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4" /> تم التغيير
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
