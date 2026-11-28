export enum CarrierWebhookStatus {
  RECEIVED = 'received',
  PROCESSED = 'processed',
  // A carrier status we don't move shipments on (cancelled, lost...).
  UNMAPPED = 'unmapped',
  ERROR = 'error',
}
