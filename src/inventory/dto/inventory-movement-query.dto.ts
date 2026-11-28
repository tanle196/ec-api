import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { InventoryMovementReason } from '../enums/inventory-movement-reason.enum';

export class InventoryMovementQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  variant_id?: string;

  @ApiPropertyOptional({ enum: InventoryMovementReason })
  @IsEnum(InventoryMovementReason)
  @IsOptional()
  reason?: InventoryMovementReason;

  @ApiPropertyOptional({ example: 'order' })
  @IsString()
  @IsOptional()
  ref_type?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  ref_id?: string;
}
