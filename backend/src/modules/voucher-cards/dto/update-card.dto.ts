import { IsNumber, IsString, IsOptional, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCardDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  planId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsIn(['first_use', 'creation'])
  startMode?: 'first_use' | 'creation';

  @IsOptional()
  @IsIn(['both', 'username_only'])
  authMode?: 'both' | 'username_only';

  @IsOptional()
  @IsString()
  batchName?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}
