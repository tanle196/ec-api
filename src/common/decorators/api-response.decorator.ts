import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../dto/pagination.dto';

// Custom Decorator để xử lý Generic
export const ApiPaginatedResponse = <TModel extends Type<any>>(
  model: TModel,
) => {
  return applyDecorators(
    // 1. Khai báo cả wrapper và model cụ thể với Swagger
    ApiExtraModels(PaginatedResponseDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          // 2. Lấy cấu trúc cơ bản từ PaginatedDto
          { $ref: getSchemaPath(PaginatedResponseDto) },
          {
            properties: {
              // 3. Ép kiểu thuộc tính 'data' thành mảng chứa Model cụ thể
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
            },
          },
        ],
      },
    }),
  );
};
