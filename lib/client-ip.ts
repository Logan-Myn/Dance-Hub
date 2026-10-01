// The client's IP as seen by our nginx. nginx sets X-Real-IP to the address
// that opened the connection ($remote_addr) and overwrites any value the
// client sent. X-Forwarded-For is only appended to, so its first entry is
// whatever the client wrote and must not be trusted.
export const CLIENT_IP_HEADER = 'x-real-ip';

export function getClientIp(headers: Headers): string | null {
  return headers.get(CLIENT_IP_HEADER)?.trim() || null;
}
