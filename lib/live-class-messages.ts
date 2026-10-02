/**
 * Messages on a class room's "app-messages" data channel.
 *
 * Any participant can publish any payload, so a payload never says who sent
 * it: the sender is the participant the media server delivers it from.
 * Moderation (deny / revoke) is only honoured from the teacher's identity.
 */

export type RoomMessage =
  | { type: "chat"; text: string }
  | { type: "hand-raise" }
  | { type: "hand-lowered" }
  | { type: "hand-denied" }
  | { type: "hand-revoked" };

export type RoomMessageEvent =
  | { kind: "chat"; from: string; text: string }
  | { kind: "hand-raised"; from: string }
  | { kind: "hand-lowered"; from: string }
  | { kind: "denied" }
  | { kind: "revoked" };

interface ReadContext {
  isTeacher: boolean;
  /** Identity of the class teacher; unset in private lessons. */
  teacherIdentity?: string;
}

export function encodeRoomMessage(message: RoomMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message));
}

/**
 * Turn a received payload into something to act on, or null to ignore it.
 * `fromIdentity` is the sending participant's identity as reported by the
 * media server (`msg.from.identity`).
 */
export function readRoomMessage(
  payload: Uint8Array,
  fromIdentity: string | undefined,
  { isTeacher, teacherIdentity }: ReadContext
): RoomMessageEvent | null {
  if (!fromIdentity) return null;

  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { type, text } = data as { type?: unknown; text?: unknown };

  switch (type) {
    case "chat":
      return typeof text === "string" && text.trim() ? { kind: "chat", from: fromIdentity, text } : null;
    case "hand-raise":
      return isTeacher ? { kind: "hand-raised", from: fromIdentity } : null;
    case "hand-lowered":
      return isTeacher ? { kind: "hand-lowered", from: fromIdentity } : null;
    case "hand-denied":
    case "hand-revoked": {
      const fromTeacher = !isTeacher && !!teacherIdentity && fromIdentity === teacherIdentity;
      if (!fromTeacher) return null;
      return { kind: type === "hand-denied" ? "denied" : "revoked" };
    }
    default:
      return null;
  }
}
