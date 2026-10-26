import { Column, Entity } from 'typeorm';
import { AbstractIdEntity } from '@/common/entities/base.entity';

@Entity('tags')
export class Tag extends AbstractIdEntity {
  @Column({ unique: true })
  name!: string;

  @Column({ unique: true })
  slug!: string;
}
