export enum OutboxEventStatus {
  // Waiting to be handled (or to be retried after a failure).
  PENDING = 'pending',
  PROCESSED = 'processed',
  // Gave up after too many failures; needs a person (see admin retry).
  DEAD = 'dead',
}
