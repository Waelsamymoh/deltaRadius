import { IsString, MinLength, Matches, IsOptional, MaxLength } from 'class-validator';

const RESERVED = ['admin', 'www', 'owner', 'api', 'mail', 'ftp', 'ns1', 'ns2'];

// valid email OR username (3–50 chars, letters/digits/underscore/dot/dash)
const LOGIN_REGEX = /^([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9_.@\-]{3,50})$/;

export class SelfRegisterDto {
  @IsString()
  @MinLength(2)
  networkName: string;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, {
    message: 'الـ subdomain: حروف إنجليزية صغيرة وأرقام وشرطة فقط، لا يبدأ أو ينتهي بشرطة',
  })
  subdomain: string;

  @IsString()
  @Matches(LOGIN_REGEX, { message: 'أدخل بريد إلكتروني أو اسم مستخدم صحيح (3 أحرف على الأقل)' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'كلمة المرور 6 أحرف على الأقل' })
  password: string;

  @IsString()
  @MinLength(8, { message: 'رقم الموبايل مطلوب' })
  @MaxLength(20)
  @Matches(/^[+\d][\d\s-]{6,}$/, { message: 'أدخل رقم موبايل صحيح' })
  phone: string;

  @IsOptional()
  @IsString()
  businessName?: string;
}

export { RESERVED };
