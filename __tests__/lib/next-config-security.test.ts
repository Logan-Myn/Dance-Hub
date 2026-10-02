/**
 * Security headers and image-optimizer limits set in next.config.js.
 *
 * @jest-environment node
 */

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };
type RemotePattern = { protocol?: string; hostname: string; pathname?: string };

const CONFIG_PATH = '../../next.config.js';

function loadConfig(nodeEnv: string) {
  const previous = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = nodeEnv;
  try {
    let config: any;
    jest.isolateModules(() => {
      config = require(CONFIG_PATH);
    });
    return config;
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = previous;
  }
}

async function headersFor(nodeEnv: string): Promise<Record<string, string>> {
  const previous = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = nodeEnv;
  try {
    const config = loadConfig(nodeEnv);
    const rules: HeaderRule[] = await config.headers();
    const all = rules.find((r) => r.source === '/:path*');
    expect(all).toBeDefined();
    return Object.fromEntries(all!.headers.map((h) => [h.key.toLowerCase(), h.value]));
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = previous;
  }
}

function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values];
      })
  );
}

describe('next.config.js security headers', () => {
  let headers: Record<string, string>;
  let csp: Record<string, string[]>;

  beforeAll(async () => {
    headers = await headersFor('production');
    csp = directives(headers['content-security-policy']);
  });

  it('stops other sites from framing the app', () => {
    expect(csp['frame-ancestors']).toEqual(["'self'"]);
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('sends HSTS without preload, nosniff and a referrer policy', () => {
    expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('keeps camera, microphone and screen sharing for our own pages (live classes, lessons)', () => {
    const policy = headers['permissions-policy'];
    expect(policy).toMatch(/(^|, )camera=\(self\)(,|$)/);
    expect(policy).toMatch(/(^|, )microphone=\(self\)(,|$)/);
    expect(policy).toMatch(/(^|, )display-capture=\(self\)(,|$)/);
    expect(policy).toMatch(/(^|, )geolocation=\(\)(,|$)/);
    // Wallet buttons run inside Stripe's frames and need the default
    // `payment` policy, so it must not be restricted here.
    expect(policy).not.toMatch(/payment=/);
  });

  it('locks down plugins, <base> and form targets', () => {
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
  });

  it('drops unused script hosts and eval in production', () => {
    const all = headers['content-security-policy'];
    expect(all).not.toContain('unpkg.com');
    expect(all).not.toContain('vercel.live');
    expect(all).not.toContain('vercel.app');
    expect(all).not.toContain('supabase.co');
    expect(csp['script-src']).not.toContain("'unsafe-eval'");
    // Next without nonces still needs inline scripts (follow-up: nonce CSP).
    expect(csp['script-src']).toContain("'unsafe-inline'");
  });

  it('allows eval only for the dev server', async () => {
    const dev = directives((await headersFor('development'))['content-security-policy']);
    expect(dev['script-src']).toContain("'unsafe-eval'");
  });

  it('still allows every origin the browser talks to', () => {
    // Stripe.js, Elements frames, 3D Secure, Stripe API
    expect(csp['script-src']).toEqual(expect.arrayContaining(['https://js.stripe.com', 'https://*.js.stripe.com']));
    expect(csp['frame-src']).toEqual(expect.arrayContaining(['https://js.stripe.com', 'https://*.stripe.com']));
    expect(csp['connect-src']).toEqual(expect.arrayContaining(['https://api.stripe.com']));
    // Mux player: HLS streams, thumbnails, Mux Data, direct uploads, Chromecast
    expect(csp['media-src']).toEqual(expect.arrayContaining(['blob:', 'https://*.mux.com']));
    expect(csp['connect-src']).toEqual(expect.arrayContaining(['https://*.mux.com', 'https://*.litix.io']));
    expect(csp['script-src']).toContain('https://www.gstatic.com');
    expect(csp['worker-src']).toEqual(expect.arrayContaining(["'self'", 'blob:']));
    // LiveKit signalling (Stream-Hub's PUBLIC_LIVEKIT_URL)
    expect(csp['connect-src']).toEqual(expect.arrayContaining(['wss://live.nexio.ee', 'https://live.nexio.ee']));
    // Uploaded images and avatars
    expect(csp['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:', 'https:']));
    expect(csp['font-src']).toEqual(expect.arrayContaining(["'self'", 'data:']));
  });

  it('does not advertise the framework', () => {
    expect(loadConfig('production').poweredByHeader).toBe(false);
  });
});

describe('next.config.js image optimizer', () => {
  const images = () => loadConfig('production').images;

  it('only fetches from our bucket, Mux thumbnails and Google avatars', () => {
    const patterns: RemotePattern[] = images().remotePatterns;
    expect(patterns).toEqual([
      { protocol: 'https', hostname: 's3.eu-central-003.backblazeb2.com', pathname: '/dancehub/**' },
      { protocol: 'https', hostname: 'image.mux.com', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
    ]);
    for (const p of patterns) {
      expect(p.hostname).not.toContain('*');
    }
  });

  it('caps the on-disk image cache', () => {
    expect(images().maximumDiskCacheSize).toBe(1024 * 1024 * 1024);
  });
});
