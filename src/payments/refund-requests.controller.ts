import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { CreateRefundRequestDto } from './dto/create-refund-request.dto';
import { RefundRequestQueryDto } from './dto/refund-request-query.dto';
import {
  RefundRequestPaginatedResponseDto,
  RefundRequestResponseDto,
} from './dto/refund-request-response.dto';
import { RefundRequestsService } from './refund-requests.service';

@ApiTags('refund-requests')
@Controller('refund-requests')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class RefundRequestsController {
  constructor(private readonly refundRequestsService: RefundRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Request a refund for a payment' })
  @ApiResponse({ status: 201, type: RefundRequestResponseDto })
  create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateRefundRequestDto,
  ): Promise<RefundRequestResponseDto> {
    return this.refundRequestsService.create(user.id!, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List my refund requests' })
  @ApiOkResponse({ type: RefundRequestPaginatedResponseDto })
  findMine(
    @CurrentUser() user: ICurrentUser,
    @Query() query: RefundRequestQueryDto,
  ): Promise<RefundRequestPaginatedResponseDto> {
    return this.refundRequestsService.findMine(user.id!, query);
  }

  @Get('me/:id')
  @ApiOperation({ summary: 'Get my refund request detail' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: RefundRequestResponseDto })
  findMineOne(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ): Promise<RefundRequestResponseDto> {
    return this.refundRequestsService.findMineOne(user.id!, id);
  }
}
