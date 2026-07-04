import {
  Controller,
  Delete,
  Param,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { MediaService } from './media.service';
import {
  MultiUploadResultDto,
  UploadResultDto,
} from './dto/media-response.dto';

@ApiTags('Admin: media')
@Controller('admin/media')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @Permissions('media.upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a single image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, type: UploadResultDto })
  async uploadOne(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResultDto> {
    return this.mediaService.uploadOne(file);
  }

  @Post('upload/multiple')
  @Permissions('media.upload')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiOperation({ summary: 'Upload multiple images (max 10)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['files'],
    },
  })
  @ApiOkResponse({ type: MultiUploadResultDto })
  async uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<MultiUploadResultDto> {
    const results = await this.mediaService.uploadMany(files);
    return { files: results };
  }

  @Delete('*publicId')
  @Permissions('media.delete')
  @ApiOperation({ summary: 'Delete an image by publicId' })
  @ApiParam({
    name: 'publicId',
    example: 'ec-api/a1b2c3d4',
    description: 'Provider public ID (may contain slashes)',
  })
  @ApiOkResponse({ schema: { example: { success: true } } })
  async remove(
    @Param('publicId') publicId: string,
  ): Promise<{ success: boolean }> {
    await this.mediaService.delete(publicId);
    return { success: true };
  }
}
