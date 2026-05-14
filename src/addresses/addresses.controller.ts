import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { AddressResponseDto } from './dto/address-response.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('addresses')
@Controller('users/me/addresses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'List my addresses' })
  @ApiOkResponse({ type: [AddressResponseDto] })
  findAll(@CurrentUser() user: ICurrentUser): Promise<AddressResponseDto[]> {
    return this.addressesService.findAllByUser(user.id!);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new address' })
  @ApiOkResponse({ type: AddressResponseDto })
  create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressesService.create(user.id!, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get address by id' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AddressResponseDto })
  findOne(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ): Promise<AddressResponseDto> {
    return this.addressesService.findOne(id, user.id!);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update address' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AddressResponseDto })
  update(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressesService.update(id, user.id!, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete address' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiNoContentResponse({ description: 'Address deleted' })
  remove(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.addressesService.remove(id, user.id!);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Set address as default' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AddressResponseDto })
  setDefault(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ): Promise<AddressResponseDto> {
    return this.addressesService.setDefault(id, user.id!);
  }
}
