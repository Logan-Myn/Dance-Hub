/**
 * Client IP for rate limiting and Stripe ToS acceptance. nginx sets
 * X-Real-IP to the connecting address and overwrites anything the client
 * sent; X-Forwarded-For is only appended to, so its first entry is whatever
 * the client wrote. Only X-Real-IP is trusted.
 *
 * @jest-environment node
 */
import { getClientIp } from '@/lib/client-ip';

describe('getClientIp', () => {
  it('reads X-Real-IP and ignores a spoofed X-Forwarded-For', () => {
    const headers = new Headers({
      'x-forwarded-for': '6.6.6.6, 203.0.113.9',
      'x-real-ip': '203.0.113.9',
    });
    expect(getClientIp(headers)).toBe('203.0.113.9');
  });

  it('returns null when the proxy header is missing', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '6.6.6.6' }))).toBeNull();
  });
});
