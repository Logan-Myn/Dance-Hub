const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

// Content-Security-Policy. Every external origin here is one the browser
// really talks to; check the code before adding or removing one.
// - Stripe.js and its frames (Elements, 3D Secure): js.stripe.com, *.stripe.com, api.stripe.com
// - Mux player: HLS from *.mux.com, Mux Data on *.litix.io, Chromecast sender on www.gstatic.com
// - LiveKit signalling: live.nexio.ee (Stream-Hub's PUBLIC_LIVEKIT_URL)
// - Uploaded files: our B2 bucket
// 'unsafe-inline' stays for scripts until we move to a nonce-based CSP.
// 'unsafe-eval' is only for the dev server (React's dev tooling uses eval).
function contentSecurityPolicy() {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    [
      "script-src 'self' 'unsafe-inline'",
      isDev ? "'unsafe-eval'" : null,
      'https://js.stripe.com https://*.js.stripe.com https://www.gstatic.com',
    ].filter(Boolean).join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://*.mux.com https://*.litix.io https://s3.eu-central-003.backblazeb2.com https://live.nexio.ee wss://live.nexio.ee",
    "frame-src 'self' https://js.stripe.com https://*.stripe.com",
    "media-src 'self' blob: https://*.mux.com https://live.nexio.ee",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

// Camera, microphone and screen sharing are needed by live classes and
// private lessons. `payment` is left at its default so Stripe's wallet
// buttons keep working inside their frames.
const PERMISSIONS_POLICY = [
  'camera=(self)',
  'microphone=(self)',
  'display-capture=(self)',
  'fullscreen=(self)',
  'geolocation=()',
  'usb=()',
  'serial=()',
  'hid=()',
  'midi=()',
  'browsing-topics=()',
].join(', ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  images: {
    // Only hosts our stored image URLs point at. Wildcard hosts would let
    // anyone resize other people's files on those services through us.
    // If B2_CDN_URL is ever set, add its host here.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's3.eu-central-003.backblazeb2.com',
        pathname: '/dancehub/**',
      },
      {
        protocol: 'https',
        hostname: 'image.mux.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
    // The default is half the free disk, on a box shared with preprod.
    maximumDiskCacheSize: 1024 * 1024 * 1024,
  },
  async redirects() {
    return [
      {
        source: '/community/:slug*',
        destination: '/:slug*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
        ],
      },
    ];
  },
}

module.exports = withBundleAnalyzer(nextConfig)
