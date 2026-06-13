import { PartialType } from '@nestjs/mapped-types';
import { CreateModemDto } from './create-modem.dto';

export class UpdateModemDto extends PartialType(CreateModemDto) {}
