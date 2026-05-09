import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { PermissionListQueryDto } from './dto/permission-list-query.dto';
import { PermissionPaginatedResponseDto } from './dto/permission-response.dto';
import { PermissionsService } from './permissions.service';
import { Permission } from './entities/permission.entity';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionMetaResponseDto } from './dto/permission-meta-response.dto';
import { Permissions } from './decorators/permissions.decorator';
import { PermissionsGuard } from './guards/permissions.guard';

@ApiTags('permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Post()
  @Permissions('permission.create')
  @ApiOperation({ summary: 'Create a new permission' })
  @ApiResponse({ status: 201, type: Permission })
  create(@Body() dto: CreatePermissionDto) {
    return this.service.create(dto);
  }

  @Get('meta')
  @Permissions('permission.read')
  @ApiOperation({
    summary: 'Get permission metadata for frontend',
    description:
      'Used to render UI (module, system action, custom action). Not for auth.',
  })
  @ApiOkResponse({ type: PermissionMetaResponseDto })
  getMeta() {
    return this.service.getMeta();
  }

  @Get()
  @Permissions('permission.read')
  @ApiOperation({ summary: 'List permissions (paginated)' })
  @ApiResponse({ status: 200, type: PermissionPaginatedResponseDto })
  findAll(@Query() query: PermissionListQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions('permission.read')
  @ApiOperation({ summary: 'Get permission by id' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiResponse({ status: 200, type: Permission })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Permissions('permission.update')
  @ApiOperation({ summary: 'Update permission' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiResponse({ status: 200, type: Permission })
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('permission.delete')
  @ApiOperation({ summary: 'Delete permission' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiResponse({ status: 200, description: 'Permission deleted' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
