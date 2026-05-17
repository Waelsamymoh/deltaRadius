import { IsString, MinLength, IsOptional, IsNumber, Matches } from 'class-validator';

export class CreateAdminUserDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'اسم المستخدم: أحرف إنجليزية وأرقام فقط' })
  @MinLength(3)
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsNumber()
  tenantId?: number;
}
