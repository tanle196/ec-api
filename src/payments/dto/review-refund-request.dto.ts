import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveRefundRequestDto {
  @ApiPropertyOptional({ example: 'Đã kiểm tra, hợp lệ' })
  @IsString()
  @IsOptional()
  note?: string;
}

export class RejectRefundRequestDto {
  @ApiProperty({ example: 'Sản phẩm không thuộc diện được hoàn tiền' })
  @IsString()
  @IsNotEmpty()
  note!: string;
}
