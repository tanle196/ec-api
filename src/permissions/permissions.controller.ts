import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { PermissionsService } from './permissions.service';
import { Permission } from './entities/permission.entity';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionMetaResponseDto } from './dto/permission-meta-response.dto';

@ApiTags('permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo permission mới' })
  @ApiResponse({ status: 201, type: Permission })
  create(@Body() dto: CreatePermissionDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách permission' })
  @ApiResponse({ status: 200, type: [Permission] })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết permission' })
  @ApiParam({
    name: 'id',
    example: 'uuid-v4',
  })
  @ApiResponse({ status: 200, type: Permission })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật permission' })
  @ApiParam({
    name: 'id',
    example: 'uuid-v4',
  })
  @ApiResponse({ status: 200, type: Permission })
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa permission' })
  @ApiParam({
    name: 'id',
    example: 'uuid-v4',
  })
  @ApiResponse({
    status: 200,
    description: 'Permission đã bị xóa',
  })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get('meta')
  @ApiOperation({
    summary: 'Lấy metadata permission cho frontend',
    description:
      'Dùng để render UI (module, system action, custom action). Không dùng cho auth.',
  })
  @ApiOkResponse({
    type: PermissionMetaResponseDto,
  })
  getMeta() {
    return this.service.getMeta();
  }
}
