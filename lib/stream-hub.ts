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

async function streamHubFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${STREAM_HUB_URL}${path}`, {
    ...options,
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

export async function generateToken(
  roomName: string,
  identity: string,
  role: "admin" | "participant" | "viewer"
): Promise<StreamHubToken> {
  const res = await streamHubFetch(`/rooms/${roomName}/tokens`, {
    method: "POST",
    body: JSON.stringify({ identity, role }),
  });
  return res.json();
}

export async function startRecording(roomName: string, callbackUrl: string): Promise<StreamHubRecording> {
  const res = await streamHubFetch(`/rooms/${roomName}/recordings/start`, {
    method: "POST",
    body: JSON.stringify({ callbackUrl }),
  });
  return res.json();
}

export async function stopRecording(roomName: string): Promise<StreamHubRecording> {
  const res = await streamHubFetch(`/rooms/${roomName}/recordings/stop`, {
    method: "POST",
  });
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
