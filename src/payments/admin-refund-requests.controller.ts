import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import {
  ApproveRefundRequestDto,
  RejectRefundRequestDto,
} from './dto/review-refund-request.dto';
import { RefundRequestQueryDto } from './dto/refund-request-query.dto';
import {
  AdminRefundRequestPaginatedResponseDto,
  AdminRefundRequestResponseDto,
} from './dto/admin-refund-request-response.dto';
import { RefundRequestsService } from './refund-requests.service';
import { mapPaginated } from '@/common/dto/pagination.dto';
import { RefundRequestMapper } from './mapper/refund-request.mapper';

@ApiTags('Admin: refund requests')
@Controller('admin/refund-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminRefundRequestsController {
  constructor(private readonly refundRequestsService: RefundRequestsService) {}

  @Get()
  @Permissions('refund.read')
  @ApiOperation({ summary: 'Admin: list all refund requests' })
  @ApiOkResponse({ type: AdminRefundRequestPaginatedResponseDto })
  findAll(
    @Query() query: RefundRequestQueryDto,
  ): Promise<AdminRefundRequestPaginatedResponseDto> {
    return this.refundRequestsService
      .findAll(query)
      .then((page) => mapPaginated(page, RefundRequestMapper.toAdminResponse));
  }

  @Get(':id')
  @Permissions('refund.read')
  @ApiOperation({ summary: 'Admin: get refund request detail' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminRefundRequestResponseDto })
  findOne(@Param('id') id: string): Promise<AdminRefundRequestResponseDto> {
    return this.refundRequestsService
      .findOne(id)
      .then(RefundRequestMapper.toAdminResponse);
  }

  @Patch(':id/approve')
  @Permissions('refund.update')
  @ApiOperation({
    summary:
      'Admin: approve a refund request (creates and executes the refund)',
  })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminRefundRequestResponseDto })
  approve(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() dto: ApproveRefundRequestDto,
  ): Promise<AdminRefundRequestResponseDto> {
    return this.refundRequestsService
      .approve(id, user.id!, dto)
      .then(RefundRequestMapper.toAdminResponse);
  }

  @Patch(':id/reject')
  @Permissions('refund.update')
  @ApiOperation({ summary: 'Admin: reject a refund request' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminRefundRequestResponseDto })
  reject(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() dto: RejectRefundRequestDto,
  ): Promise<AdminRefundRequestResponseDto> {
    return this.refundRequestsService
      .reject(id, user.id!, dto)
      .then(RefundRequestMapper.toAdminResponse);
  }
}
