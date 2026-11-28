import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import {
  OutboxEventPaginatedResponseDto,
  OutboxEventResponseDto,
} from './dto/outbox-event-response.dto';
import { OutboxQueryDto } from './dto/outbox-query.dto';
import { OutboxService } from './outbox.service';

@ApiTags('Admin: outbox')
@Controller('admin/outbox')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminOutboxController {
  constructor(private readonly outboxService: OutboxService) {}

  @Get()
  @Permissions('order.read')
  @ApiOperation({
    summary: 'Admin: background events (use status=dead to find failures)',
  })
  @ApiOkResponse({ type: OutboxEventPaginatedResponseDto })
  findAll(
    @Query() query: OutboxQueryDto,
  ): Promise<OutboxEventPaginatedResponseDto> {
    return this.outboxService.findAll(query);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @Permissions('order.update')
  @ApiOperation({ summary: 'Admin: queue a failed event again' })
  @ApiOkResponse({ type: OutboxEventResponseDto })
  retry(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OutboxEventResponseDto> {
    return this.outboxService.retry(id);
  }
}
