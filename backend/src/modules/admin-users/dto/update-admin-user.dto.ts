import { IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
