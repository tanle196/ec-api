import { PartialType } from '@nestjs/swagger';
import { CreateStockReceiptDto } from './create-stock-receipt.dto';

// `items`, when given, replaces the whole item list.
export class UpdateStockReceiptDto extends PartialType(CreateStockReceiptDto) {}
