/**
 * @jest-environment node
 */
import { resolveStatusChange, OPENING_DATE_LOCKED_MESSAGE } from '@/lib/community-status';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const FUTURE = '2026-11-01T18:00:00.000Z';
const LATER = '2026-11-15T18:00:00.000Z';
const PAST = '2026-09-01T18:00:00.000Z';

const preReg = { status: 'pre_registration', opening_date: new Date(FUTURE), can_change_opening_date: true };
const active = { status: 'active', opening_date: null, can_change_opening_date: true };

describe('resolveStatusChange', () => {
  it('keeps everything when nothing changes', () => {
    expect(resolveStatusChange(preReg, { status: 'pre_registration', openingDate: FUTURE }, NOW)).toEqual({
      ok: true, status: 'pre_registration', openingDate: new Date(FUTURE), changed: false,
    });
  });

  it('keeps a date that has passed when only other settings are saved', () => {
    const result = resolveStatusChange({ ...preReg, opening_date: new Date(PAST) }, { status: 'pre_registration', openingDate: PAST }, NOW);
    expect(result).toMatchObject({ ok: true, changed: false });
  });

  it('keeps the current status and date when the fields are omitted', () => {
    expect(resolveStatusChange(preReg, {}, NOW)).toMatchObject({ ok: true, status: 'pre_registration', changed: false });
  });

  it('refuses a status outside the allowed set', () => {
    expect(resolveStatusChange(active, { status: 'archived' }, NOW)).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it('moves the date when it is not locked', () => {
    expect(resolveStatusChange(preReg, { status: 'pre_registration', openingDate: LATER }, NOW)).toEqual({
      ok: true, status: 'pre_registration', openingDate: new Date(LATER), changed: true,
    });
  });

  it('refuses to move a locked date', () => {
    const result = resolveStatusChange({ ...preReg, can_change_opening_date: false }, { status: 'pre_registration', openingDate: LATER }, NOW);
    expect(result).toEqual({ ok: false, httpStatus: 403, error: OPENING_DATE_LOCKED_MESSAGE });
  });

  it('lets a community with a locked date leave pre-registration (the date is cleared)', () => {
    const locked = { ...preReg, can_change_opening_date: false };
    expect(resolveStatusChange(locked, { status: 'active', openingDate: null }, NOW)).toEqual({
      ok: true, status: 'active', openingDate: null, changed: true,
    });
    expect(resolveStatusChange(locked, { status: 'inactive', openingDate: null }, NOW)).toMatchObject({ ok: true, status: 'inactive' });
  });

  it('refuses pre-registration without a date, or with a date in the past', () => {
    expect(resolveStatusChange(active, { status: 'pre_registration', openingDate: null }, NOW)).toMatchObject({ ok: false, httpStatus: 400 });
    expect(resolveStatusChange(active, { status: 'pre_registration', openingDate: 'not a date' }, NOW)).toMatchObject({ ok: false, httpStatus: 400 });
    expect(resolveStatusChange(active, { status: 'pre_registration', openingDate: PAST }, NOW)).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it('stores no date outside pre-registration', () => {
    expect(resolveStatusChange(preReg, { status: 'active', openingDate: FUTURE }, NOW)).toEqual({
      ok: true, status: 'active', openingDate: null, changed: true,
    });
  });

  it('ignores a date left behind on an opened community', () => {
    const opened = { status: 'active', opening_date: new Date(PAST), can_change_opening_date: false };
    expect(resolveStatusChange(opened, { status: 'inactive', openingDate: null }, NOW)).toEqual({
      ok: true, status: 'inactive', openingDate: null, changed: true,
    });
  });

  it('treats a missing current status as active', () => {
    expect(resolveStatusChange({ ...active, status: null }, { status: 'active' }, NOW)).toMatchObject({ ok: true, changed: false });
  });
});
