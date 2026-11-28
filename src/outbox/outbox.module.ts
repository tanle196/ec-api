import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminOutboxController } from './admin-outbox.controller';
import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxDispatcher } from './outbox.dispatcher';
import { OutboxService } from './outbox.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  controllers: [AdminOutboxController],
  providers: [OutboxService, OutboxDispatcher],
  exports: [OutboxService],
})
export class OutboxModule {}
