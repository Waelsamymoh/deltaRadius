import { IsNumber, IsString, IsOptional, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateCardsDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  planId: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  durationDays: number;

  @IsIn(['first_use', 'creation'])
  startMode: 'first_use' | 'creation';

  @IsIn(['numbers', 'letters', 'alphanumeric'])
  codeFormat: 'numbers' | 'letters' | 'alphanumeric';

  @Type(() => Number)
  @IsNumber()
  @Min(4)
  @Max(32)
  codeLength: number;

  @IsIn(['both', 'username_only'])
  authMode: 'both' | 'username_only';

  @IsOptional()
  @IsString()
  batchName?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
