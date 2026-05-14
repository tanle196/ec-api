import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional() addressLine2!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() province!: string;
  @ApiProperty() country!: string;
  @ApiPropertyOptional() postalCode!: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
