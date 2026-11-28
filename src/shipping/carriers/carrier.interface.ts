import type { ShipmentStatus } from '@/orders/shipments/enums/shipment-status.enum';

export interface CarrierRecipient {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  districtCode: string | null;
  wardCode: string | null;
}

export interface CarrierBookingRequest {
  // Our reference the carrier echoes back (the order number).
  reference: string;
  recipient: CarrierRecipient;
  items: { name: string; quantity: number; weightGrams: number }[];
  parcel: {
    weightGrams: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
  };
  // Cash the carrier collects on delivery (0 if already paid).
  codAmount: number;
  // Declared value for insurance.
  insuranceValue: number;
  note?: string;
}

export interface CarrierBooking {
  trackingNumber: string;
  fee: number | null;
  expectedDeliveryAt: Date | null;
  raw?: Record<string, unknown>;
}

/**
 * A carrier status update, already mapped. `status` is null for carrier
 * statuses we don't move shipments on (booking cancelled, lost, damaged...);
 * those are kept for a person to look at.
 */
export interface CarrierStatusUpdate {
  trackingNumber: string;
  status: ShipmentStatus | null;
  carrierStatus: string;
  description: string | null;
  occurredAt: Date;
  // Identifies this exact update, for deduplicating redeliveries.
  eventKey: string;
}

export interface CarrierProvider {
  // Matches Shipment.carrier (case-insensitive), e.g. "GHN".
  readonly code: string;
  book(request: CarrierBookingRequest): Promise<CarrierBooking>;
  cancel(trackingNumber: string): Promise<void>;
  verifyWebhook(query: Record<string, string>): boolean;
  parseWebhook(body: Record<string, unknown>): CarrierStatusUpdate;
}
