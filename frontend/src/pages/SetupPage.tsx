import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Radio, ShieldCheck } from 'lucide-react'
import { authApi } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const schema = z.object({
  email: z.string().min(1, 'مطلوب'),
  password: z.string().min(6, 'على الأقل 6 أحرف'),
  confirmPassword: z.string().min(1, 'مطلوب'),
  fullName: z.string().optional(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

export default function SetupPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      setError('')
      await authApi.setupFirstAdmin({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
      })
      navigate('/login', { replace: true })
    } catch {
      setError('حدث خطأ، حاول مرة أخرى')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40" dir="rtl">
      <div className="w-full max-w-md space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <div className="p-4 bg-primary rounded-full">
              <Radio className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">RadiusManager</h1>
          <p className="text-muted-foreground text-sm mt-1">مرحباً بك — ابدأ بإنشاء حساب المشرف العام</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">إعداد أول مسؤول</CardTitle>
            </div>
            <CardDescription>
              لم يتم العثور على أي حسابات. قم بإنشاء حساب المشرف العام للبدء.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>الاسم الكامل (اختياري)</Label>
                <Input {...register('fullName')} placeholder="محمد أحمد" />
              </div>
              <div className="space-y-1">
                <Label>اسم المستخدم / البريد الإلكتروني</Label>
                <Input {...register('email')} placeholder="admin@example.com" />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>كلمة المرور</Label>
                <Input type="password" {...register('password')} placeholder="••••••••" />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>تأكيد كلمة المرور</Label>
                <Input type="password" {...register('confirmPassword')} placeholder="••••••••" />
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
              </div>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء الحساب والبدء'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
