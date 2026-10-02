// Rules for changing a community's status and opening date (owner settings).
// Pure, so the route and its tests share one definition.

export const COMMUNITY_STATUSES = ['active', 'pre_registration', 'inactive'] as const;
export type CommunityStatus = (typeof COMMUNITY_STATUSES)[number];

/** Member statuses of someone who pre-registered and hasn't been charged yet. */
export const PRE_REGISTERED_STATUSES: readonly string[] = ['pre_registered', 'pending_pre_registration'];

// Every pre-registration subscription was created with its first charge
// (billing_cycle_anchor) on the opening date of the day. Moving the date or
// leaving pre-registration does not move those charges, so once someone has
// pre-registered the change has to be done by us, subscription by subscription.
export const PRE_REGISTRATIONS_LOCK_MESSAGE =
  "People have already pre-registered, so the status and opening date can't be changed here. " +
  "Contact hello@dance-hub.io and we'll move everyone's start date for you.";

export const OPENING_DATE_LOCKED_MESSAGE =
  'The opening date is locked. Contact hello@dance-hub.io if you need to change it.';

export interface CurrentCommunityStatus {
  status: string | null;
  opening_date: Date | string | null;
  can_change_opening_date: boolean | null;
}

export type StatusChange =
  | { ok: true; status: CommunityStatus; openingDate: Date | null; changed: boolean }
  | { ok: false; httpStatus: number; error: string };

function isStatus(value: unknown): value is CommunityStatus {
  return typeof value === 'string' && (COMMUNITY_STATUSES as readonly string[]).includes(value);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Works out the status and opening date to store. `requested` fields that are
 * undefined keep the current value. The opening date only exists in
 * pre-registration; any other status stores null. Callers must still refuse a
 * `changed` result while the community has pre-registrations.
 */
export function resolveStatusChange(
  current: CurrentCommunityStatus,
  requested: { status?: unknown; openingDate?: unknown },
  now: Date = new Date()
): StatusChange {
  const currentStatus: CommunityStatus = isStatus(current.status) ? current.status : 'active';
  const currentDate = toDate(current.opening_date);

  const status = requested.status === undefined ? currentStatus : requested.status;
  if (!isStatus(status)) {
    return { ok: false, httpStatus: 400, error: 'Please choose a valid community status' };
  }

  let openingDate: Date | null = null;
  if (status === 'pre_registration') {
    openingDate = requested.openingDate === undefined ? currentDate : toDate(requested.openingDate);
    if (!openingDate) {
      return { ok: false, httpStatus: 400, error: 'Opening date is required for pre-registration mode' };
    }
  }

  // Outside pre-registration a stored date means nothing (the opening cron
  // leaves it behind), so only a pre-registration date counts as one.
  const currentOpening = currentStatus === 'pre_registration' ? currentDate : null;
  const statusChanged = status !== currentStatus;
  const dateChanged = (currentOpening?.getTime() ?? null) !== (openingDate?.getTime() ?? null);
  if (!statusChanged && !dateChanged) {
    // Saving other settings must not trip over a date that has since passed.
    return { ok: true, status, openingDate: currentDate, changed: false };
  }

  if (dateChanged && current.can_change_opening_date === false) {
    return { ok: false, httpStatus: 403, error: OPENING_DATE_LOCKED_MESSAGE };
  }

  if (openingDate && openingDate.getTime() <= now.getTime()) {
    return { ok: false, httpStatus: 400, error: 'Opening date must be in the future' };
  }

  return { ok: true, status, openingDate, changed: true };
}
