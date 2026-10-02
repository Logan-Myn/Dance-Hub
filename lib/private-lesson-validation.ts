// Checks shared by the private-lesson create (POST) and update (PUT) routes.
// Each returns an error message for the teacher, or null when the value is
// fine.

export const LOCATION_TYPES = ['online', 'in_person', 'both'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/** Regular price > 0; member price, when set, between 0 and the regular price. */
export function lessonPriceError(regular: unknown, member: unknown): string | null {
  if (typeof regular !== 'number' || !Number.isFinite(regular) || regular <= 0) {
    return 'Regular price must be greater than 0';
  }
  if (member === null) return null;
  if (typeof member !== 'number' || !Number.isFinite(member) || member < 0) {
    return 'Member price cannot be negative';
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
