import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ResolvePaymentIssueDto {
  @ApiProperty({ example: 'Đã gọi khách, khách đồng ý nhận hoàn tiền' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note!: string;
}
