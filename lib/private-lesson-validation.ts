// Checks shared by the private-lesson create (POST) and update (PUT) routes.
// Each returns an error message for the teacher, or null when the value is
// fine.

export const LOCATION_TYPES = ['online', 'in_person', 'both'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

// The smallest card payment accepted in EUR.
export const MIN_LESSON_PRICE = 0.5;

/**
 * Regular price at least 0.50. Member price: none (null), 0 for no
 * discount, or between 0.50 and the regular price.
 */
export function lessonPriceError(regular: unknown, member: unknown): string | null {
  if (typeof regular !== 'number' || !Number.isFinite(regular) || regular < MIN_LESSON_PRICE) {
    return 'Regular price must be at least €0.50';
  }
  if (member === null || member === 0) return null;
  if (typeof member !== 'number' || !Number.isFinite(member) || member < 0) {
    return 'Member price cannot be negative';
  }
  if (member < MIN_LESSON_PRICE) {
    return 'Member price must be 0 (no discount) or at least €0.50';
  }
  if (member > regular) {
    return 'Member price cannot be greater than regular price';
  }
  return null;
}

/** No limit (null) or a positive whole number of bookings per month. */
export function maxBookingsError(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return 'Max bookings per month must be a whole number of at least 1';
  }
  return null;
}

export function locationTypeError(value: unknown): string | null {
  return LOCATION_TYPES.includes(value as LocationType)
    ? null
    : 'Location must be online, in person or both';
}

/** Trimmed requirements text, or null when it is empty. */
export function normalizeRequirements(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
