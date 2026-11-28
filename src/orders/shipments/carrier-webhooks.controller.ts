import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CarrierWebhooksService } from './carrier-webhooks.service';

// Register https://<api>/shipping/webhooks/ghn?token=<GHN_WEBHOOK_SECRET>
// as the status callback URL in the carrier's portal.
@ApiExcludeController()
@SkipThrottle()
@Controller('shipping/webhooks')
export class CarrierWebhooksController {
  constructor(private readonly webhooks: CarrierWebhooksService) {}

  @Post(':carrier')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Param('carrier') carrier: string,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, string>,
  ): Promise<{ received: boolean }> {
    await this.webhooks.handle(carrier, body, query);
    return { received: true };
  }
}
