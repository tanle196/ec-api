import { ApiProperty } from '@nestjs/swagger';
import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export abstract class AbstractIdEntity {
  @ApiProperty({
    example: 'e4b5f7a0-1c2d-4e3f-8a9b-0c1d2e3f4a5b',
    description: 'ID',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;
}

export abstract class AbstractBaseEntity extends AbstractIdEntity {
  @ApiProperty({
    example: '2026-01-01T10:00:00Z',
    description: 'Thời gian tạo',
  })
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-01-01T10:05:00Z',
    description: 'Thời gian cập nhật',
  })
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
