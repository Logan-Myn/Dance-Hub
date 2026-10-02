const STREAM_HUB_URL = process.env.STREAM_HUB_URL || "http://localhost:3060";
const STREAM_HUB_API_KEY = process.env.STREAM_HUB_API_KEY!;

interface StreamHubRoom {
  name: string;
  maxParticipants: number;
  sid: string;
}

interface StreamHubToken {
  token: string;
  serverUrl: string;
}

interface StreamHubRecording {
  egressId: string;
  status: string;
}

// Don't let a hung Stream-Hub hold up a request (and the class page) forever.
const DEFAULT_TIMEOUT_MS = 5_000;
// Starting or stopping the recorder can take a few seconds on its own.
const RECORDING_TIMEOUT_MS = 15_000;

async function streamHubFetch(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const response = await fetch(`${STREAM_HUB_URL}${path}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(timeoutMs),
    headers: {
      "x-api-key": STREAM_HUB_API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Stream-Hub ${options.method || "GET"} ${path} failed (${response.status}): ${body}`);
  }

  return response;
}

export async function createRoom(name: string, maxParticipants = 100): Promise<StreamHubRoom> {
  const res = await streamHubFetch("/rooms", {
    method: "POST",
    body: JSON.stringify({ name, maxParticipants }),
  });
  return res.json();
}

export async function getRoom(name: string): Promise<StreamHubRoom | null> {
  try {
    const res = await streamHubFetch(`/rooms/${name}`);
    return res.json();
  } catch {
    return null;
  }
}

export async function deleteRoom(name: string): Promise<void> {
  await streamHubFetch(`/rooms/${name}`, { method: "DELETE" });
}

interface TokenOptions {
  /** Label to show. Stream-Hub doesn't put it in the token yet (it ignores
   *  the field), so clients look names up by identity instead. */
  name?: string;
  /** Extra grants on top of the role's. Stream-Hub copies these into the
   *  token as given. */
  permissions?: {
    canPublish?: boolean;
    canSubscribe?: boolean;
    canPublishData?: boolean;
    canUpdateOwnMetadata?: boolean;
  };
}

/**
 * `identity` must be unique per user in the room: joining with an identity
 * that's already there disconnects the earlier participant.
 */
export async function generateToken(
  roomName: string,
  identity: string,
  role: "admin" | "participant" | "viewer",
  { name, permissions }: TokenOptions = {}
): Promise<StreamHubToken> {
  const res = await streamHubFetch(`/rooms/${roomName}/tokens`, {
    method: "POST",
    body: JSON.stringify({ identity, role, name, permissions }),
  });
  return res.json();
}

/**
 * Grant or revoke a participant's right to publish audio/video. Revoking
 * also unpublishes what they're sending. The media server replaces the whole
 * permission set, so subscribe and data are always sent as true.
 */
export async function setParticipantCanPublish(
  roomName: string,
  identity: string,
  canPublish: boolean
): Promise<void> {
  await streamHubFetch(`/rooms/${roomName}/participants/${encodeURIComponent(identity)}`, {
    method: "PATCH",
    body: JSON.stringify({ canPublish, canSubscribe: true, canPublishData: true }),
  });
}

export async function startRecording(roomName: string, callbackUrl: string): Promise<StreamHubRecording> {
  const res = await streamHubFetch(
    `/rooms/${roomName}/recordings/start`,
    { method: "POST", body: JSON.stringify({ callbackUrl }) },
    RECORDING_TIMEOUT_MS
  );
  return res.json();
}

export async function stopRecording(roomName: string): Promise<StreamHubRecording> {
  const res = await streamHubFetch(
    `/rooms/${roomName}/recordings/stop`,
    { method: "POST" },
    RECORDING_TIMEOUT_MS
  );
  return res.json();
}

export async function getRecordingStatus(roomName: string): Promise<StreamHubRecording | null> {
  try {
    const res = await streamHubFetch(`/rooms/${roomName}/recordings/status`);
    return res.json();
  } catch {
    return null;
  }
}
