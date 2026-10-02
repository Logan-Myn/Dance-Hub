/**
 * @jest-environment node
 *
 * Room data messages can be sent by any participant with any payload. Who
 * sent one comes from the media server (the `from` participant), so that is
 * the only thing moderation and chat names may rely on.
 */
import { encodeRoomMessage, readRoomMessage } from '@/lib/live-class-messages';

const enc = (data: unknown) => new TextEncoder().encode(JSON.stringify(data));
const student = { isTeacher: false, teacherIdentity: 'u-teacher' };
const teacher = { isTeacher: true, teacherIdentity: 'u-teacher' };

describe('moderation messages to a student', () => {
  it.each(['hand-denied', 'hand-revoked'])('ignores %s from anyone but the teacher', (type) => {
    expect(readRoomMessage(enc({ type }), 'u-mallory', student)).toBeNull();
    // A payload claiming to be from the teacher changes nothing.
    expect(readRoomMessage(enc({ type, sender: 'u-teacher', participantIdentity: 'u-teacher' }), 'u-mallory', student)).toBeNull();
  });

  it('honours them from the teacher', () => {
    expect(readRoomMessage(enc({ type: 'hand-denied' }), 'u-teacher', student)).toEqual({ kind: 'denied' });
    expect(readRoomMessage(enc({ type: 'hand-revoked' }), 'u-teacher', student)).toEqual({ kind: 'revoked' });
  });

  it('ignores them when no teacher is known (private lessons)', () => {
    expect(readRoomMessage(enc({ type: 'hand-revoked' }), 'Teacher', { isTeacher: false })).toBeNull();
  });

  it('ignores messages with no sender', () => {
    expect(readRoomMessage(enc({ type: 'hand-revoked' }), undefined, student)).toBeNull();
  });
});

describe('hand raises to the teacher', () => {
  it('attributes a raise to the sender, not to the identity in the payload', () => {
    expect(readRoomMessage(enc({ type: 'hand-raise', participantIdentity: 'u-victim', sender: 'Victim' }), 'u-bob', teacher))
      .toEqual({ kind: 'hand-raised', from: 'u-bob' });
  });

  it('lowers the sender\'s hand whatever the payload calls it (old clients sent sessionId)', () => {
    expect(readRoomMessage(enc({ type: 'hand-lowered', sessionId: 'u-bob' }), 'u-bob', teacher))
      .toEqual({ kind: 'hand-lowered', from: 'u-bob' });
  });

  it('is not shown to students', () => {
    expect(readRoomMessage(enc({ type: 'hand-raise' }), 'u-bob', student)).toBeNull();
  });
});

describe('chat', () => {
  it('takes the sender from the participant and drops the payload name', () => {
    expect(readRoomMessage(enc({ type: 'chat', text: 'hi', senderName: 'Teacher Anna' }), 'u-mallory', student))
      .toEqual({ kind: 'chat', from: 'u-mallory', text: 'hi' });
  });

  it('ignores empty or malformed messages', () => {
    expect(readRoomMessage(enc({ type: 'chat', text: '   ' }), 'u-a', student)).toBeNull();
    expect(readRoomMessage(enc({ type: 'chat', text: 42 }), 'u-a', student)).toBeNull();
    expect(readRoomMessage(new TextEncoder().encode('{nope'), 'u-a', student)).toBeNull();
    expect(readRoomMessage(enc(null), 'u-a', student)).toBeNull();
  });
});

it('encodes only the message itself', () => {
  expect(new TextDecoder().decode(encodeRoomMessage({ type: 'hand-lowered' }))).toBe('{"type":"hand-lowered"}');
});
