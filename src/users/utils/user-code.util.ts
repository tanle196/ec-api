export function generateUserCode(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `USR-${datePart}-${random}`;
}
