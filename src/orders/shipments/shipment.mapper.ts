import { ShipmentResponseDto } from './dto/shipment-response.dto';
import { Shipment } from './entities/shipment.entity';

export class ShipmentMapper {
  static toResponse = (s: Shipment): ShipmentResponseDto => ({
    id: s.id,
    order_id: s.order_id,
    status: s.status,
    carrier: s.carrier,
    trackingNumber: s.trackingNumber,
    attempts: s.attempts,
    shippedAt: s.shippedAt,
    deliveredAt: s.deliveredAt,
    returnedAt: s.returnedAt,
    events: [...(s.events ?? [])]
      .sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt))
      .map((e) => ({
        id: e.id,
        status: e.status,
        description: e.description,
        occurredAt: e.occurredAt,
        source: e.source,
        actorId: e.actorId,
      })),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  });
}
