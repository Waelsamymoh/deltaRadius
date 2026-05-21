import { IsEmail, IsString, IsOptional, MinLength, IsArray, ArrayUnique } from 'class-validator';

export class CreateOwnerAssistantDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  /** Permission keys — see OWNER_PERMISSION_KEYS for the canonical list. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];
}
