import { OrderStatusChangeActor } from '../enums/order-status-change-actor.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { ShipmentEvent } from './entities/shipment-event.entity';
import { Shipment } from './entities/shipment.entity';
import { ShipmentEventSource } from './enums/shipment-event-source.enum';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { ShipmentPolicy } from './policies/shipment.policy';
import { ShipmentsService } from './shipments.service';

describe('ShipmentsService', () => {
  const admin = { source: ShipmentEventSource.ADMIN, actorId: 'admin-1' };

  const build = (shipment: Record<string, unknown> | null = null) => {
    const state = { shipment, active: null as object | null };
    const manager = {
      findOne: jest.fn((entity: unknown, opts: { lock?: unknown }) =>
        Promise.resolve(
          entity === Shipment
            ? opts.lock
              ? state.shipment
              : state.active
            : null,
        ),
      ),
      create: jest.fn((_e: unknown, d: object) => ({ ...d })),
      save: jest.fn((entity: unknown, d: object) =>
        Promise.resolve(entity === Shipment ? { id: 'ship-1', ...d } : d),
      ),
    };
    // Reads outside the transaction (pre-booking checks, booking data).
    const reads = {
      order: {
        id: 'order-1',
        status: OrderStatus.PROCESSING,
        orderNumber: 'ORD-1',
        subtotal: '300000',
        weightGrams: 900,
        shippingAddress: {
          fullName: 'An',
          phone: '0900',
          addressLine1: '1 Lê Lợi',
          addressLine2: null,
          city: 'Q1',
          province: 'HCM',
          country: 'VN',
          postalCode: null,
          districtCode: '1442',
          wardCode: '20109',
        },
      } as Record<string, unknown>,
      items: [
        { productName: 'Áo', variantName: 'M', quantity: 2, variant_id: 'v-1' },
      ],
      variants: [
        { id: 'v-1', weightGrams: 300, lengthCm: 30, widthCm: 20, heightCm: 3 },
      ],
      cod: null as object | null,
    };
    const readManager = {
      findOne: jest.fn((entity: { name?: string }) =>
        Promise.resolve(entity.name === 'Order' ? reads.order : reads.cod),
      ),
      findOneOrFail: jest.fn(() => Promise.resolve(reads.order)),
      find: jest.fn((entity: { name?: string }) =>
        Promise.resolve(
          entity.name === 'OrderItem' ? reads.items : reads.variants,
        ),
      ),
    };
    const dataSource = {
      manager: readManager,
      transaction: jest.fn((cb: (m: typeof manager) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    const provider = {
      code: 'GHN',
      book: jest.fn().mockResolvedValue({
        trackingNumber: 'GHN123',
        fee: 32000,
        expectedDeliveryAt: new Date('2026-12-01'),
      }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    const carriers = {
      resolve: jest.fn((code: string) =>
        code.toLowerCase() === 'ghn' ? provider : undefined,
      ),
    };
    const shippingRates = {
      weightOf: (lines: { weightGrams: number | null; quantity: number }[]) =>
        lines.reduce((sum, l) => sum + (l.weightGrams ?? 500) * l.quantity, 0),
    };
    const shipmentRepo = {
      // A lookup by status is "is one on its way?"; anything else reloads
      // the shipment just written.
      findOne: jest.fn((opts: { where: { status?: unknown } }) =>
        Promise.resolve(
          opts.where.status ? state.active : { id: 'ship-1', events: [] },
        ),
      ),
      find: jest.fn().mockResolvedValue([]),
    };
    const ordersService = {
      applyShipmentProgress: jest.fn().mockResolvedValue({}),
    };
    const service = new ShipmentsService(
      shipmentRepo as never,
      dataSource as never,
      ordersService as never,
      new ShipmentPolicy(),
      carriers as never,
      shippingRates as never,
    );
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    const events = () =>
      (manager.save.mock.calls as [unknown, Record<string, unknown>][])
        .filter(([e]) => e === ShipmentEvent)
        .map(([, d]) => d);
    return { service, state, manager, ordersService, events, provider, reads };
  };

  describe('handOver with an integrated carrier', () => {
    it('books the parcel first and records its tracking number and fee', async () => {
      const ctx = build();

      await ctx.service.handOver('order-1', { carrier: 'GHN' }, admin);

      expect(ctx.provider.book).toHaveBeenCalledWith({
        reference: 'ORD-1',
        recipient: expect.objectContaining({
          fullName: 'An',
          districtCode: '1442',
          wardCode: '20109',
        }) as unknown,
        items: [{ name: 'Áo - M', quantity: 2, weightGrams: 300 }],
        parcel: { weightGrams: 900, lengthCm: 30, widthCm: 20, heightCm: 10 },
        codAmount: 0,
        insuranceValue: 300000,
        note: undefined,
      });
      expect(ctx.manager.save).toHaveBeenCalledWith(
        Shipment,
        expect.objectContaining({
          carrier: 'GHN',
          trackingNumber: 'GHN123',
          carrierFee: 32000,
        }),
      );
    });

    it('asks the carrier to collect an open cash-on-delivery payment', async () => {
      const ctx = build();
      ctx.reads.cod = { amount: '350000' };

      await ctx.service.handOver('order-1', { carrier: 'GHN' }, admin);

      expect(ctx.provider.book).toHaveBeenCalledWith(
        expect.objectContaining({ codAmount: 350000 }),
      );
    });

    it('cancels the booking when recording the hand-over fails', async () => {
      const ctx = build();
      ctx.ordersService.applyShipmentProgress.mockRejectedValue(
        new Error('locked'),
      );

      await expect(
        ctx.service.handOver('order-1', { carrier: 'GHN' }, admin),
      ).rejects.toThrow('locked');
      expect(ctx.provider.cancel).toHaveBeenCalledWith('GHN123');
    });

    it('does not book an order that is not ready to ship', async () => {
      const ctx = build();
      ctx.reads.order = { ...ctx.reads.order, status: OrderStatus.CONFIRMED };

      await expect(
        ctx.service.handOver('order-1', { carrier: 'GHN' }, admin),
      ).rejects.toThrow('Only processing orders can be handed to a carrier');
      expect(ctx.provider.book).not.toHaveBeenCalled();
    });

    it('books nothing when staff give a tracking number (booked elsewhere)', async () => {
      const ctx = build();

      await ctx.service.handOver(
        'order-1',
        { carrier: 'GHN', trackingNumber: 'GHN-PORTAL-1' },
        admin,
      );

      expect(ctx.provider.book).not.toHaveBeenCalled();
      expect(ctx.manager.save).toHaveBeenCalledWith(
        Shipment,
        expect.objectContaining({ trackingNumber: 'GHN-PORTAL-1' }),
      );
    });
  });

  describe('handOver', () => {
    it('ships the order, then records an in-transit shipment', async () => {
      const ctx = build();

      await ctx.service.handOver(
        'order-1',
        { carrier: 'GHN', trackingNumber: 'GHN1' },
        admin,
      );

      expect(ctx.ordersService.applyShipmentProgress).toHaveBeenCalledWith(
        ctx.manager,
        'order-1',
        OrderStatus.SHIPPED,
        {
          actorType: OrderStatusChangeActor.ADMIN,
          actorId: 'admin-1',
          note: 'Handed to GHN',
        },
      );
      expect(ctx.manager.save).toHaveBeenCalledWith(
        Shipment,
        expect.objectContaining({
          order_id: 'order-1',
          status: ShipmentStatus.IN_TRANSIT,
          carrier: 'GHN',
          trackingNumber: 'GHN1',
          attempts: 1,
        }),
      );
      expect(ctx.events()).toEqual([
        expect.objectContaining({
          status: ShipmentStatus.IN_TRANSIT,
          source: ShipmentEventSource.ADMIN,
        }),
      ]);
    });

    it('refuses a second parcel while one is on its way', async () => {
      const ctx = build();
      ctx.state.active = { id: 'ship-0' };

      await expect(
        ctx.service.handOver('order-1', { carrier: 'GHN' }, admin),
      ).rejects.toThrow('Order already has a shipment on its way');
    });
  });

  describe('recordEvent', () => {
    const inTransit = () => ({
      id: 'ship-1',
      order_id: 'order-1',
      status: ShipmentStatus.IN_TRANSIT,
      attempts: 1,
    });

    it('moves shipment and order on delivery', async () => {
      const ctx = build(inTransit());
      const at = new Date('2026-11-28T09:00:00Z');

      await ctx.service.recordEvent(
        'ship-1',
        { status: ShipmentStatus.DELIVERED, occurredAt: at },
        admin,
      );

      expect(ctx.state.shipment).toEqual(
        expect.objectContaining({
          status: ShipmentStatus.DELIVERED,
          deliveredAt: at,
        }),
      );
      expect(ctx.ordersService.applyShipmentProgress).toHaveBeenCalledWith(
        ctx.manager,
        'order-1',
        OrderStatus.DELIVERED,
        expect.anything(),
      );
    });

    it('counts a re-attempt after a failed delivery', async () => {
      const ctx = build({
        ...inTransit(),
        status: ShipmentStatus.DELIVERY_FAILED,
      });

      await ctx.service.recordEvent(
        'ship-1',
        { status: ShipmentStatus.IN_TRANSIT, description: 'Giao lại' },
        { source: ShipmentEventSource.CARRIER },
        { carrierCode: 'retry' },
      );

      expect(ctx.state.shipment).toEqual(
        expect.objectContaining({ attempts: 2 }),
      );
      expect(ctx.ordersService.applyShipmentProgress).toHaveBeenCalledWith(
        ctx.manager,
        'order-1',
        OrderStatus.SHIPPED,
        expect.objectContaining({ actorType: OrderStatusChangeActor.SYSTEM }),
      );
      expect(ctx.events()[0]).toEqual(
        expect.objectContaining({
          raw: { carrierCode: 'retry' },
          source: 'carrier',
        }),
      );
    });

    it('keeps the order at delivery_failed while the parcel is returning', async () => {
      const ctx = build({
        ...inTransit(),
        status: ShipmentStatus.DELIVERY_FAILED,
      });

      await ctx.service.recordEvent(
        'ship-1',
        { status: ShipmentStatus.RETURNING },
        admin,
      );

      expect(ctx.ordersService.applyShipmentProgress).toHaveBeenCalledWith(
        ctx.manager,
        'order-1',
        OrderStatus.DELIVERY_FAILED,
        expect.anything(),
      );
    });

    it('only adds history for a repeated status', async () => {
      const ctx = build(inTransit());

      await ctx.service.recordEvent(
        'ship-1',
        { status: ShipmentStatus.IN_TRANSIT },
        admin,
      );

      expect(ctx.ordersService.applyShipmentProgress).not.toHaveBeenCalled();
      expect(ctx.events()).toHaveLength(1);
    });

    it('rejects an impossible move', async () => {
      const ctx = build(inTransit());

      await expect(
        ctx.service.recordEvent(
          'ship-1',
          { status: ShipmentStatus.RETURNED },
          admin,
        ),
      ).rejects.toThrow('Cannot move shipment from "in_transit" to "returned"');
    });

    it('throws for an unknown shipment', async () => {
      const ctx = build(null);
      await expect(
        ctx.service.recordEvent(
          'x',
          { status: ShipmentStatus.DELIVERED },
          admin,
        ),
      ).rejects.toThrow('Shipment not found');
    });
  });
});
