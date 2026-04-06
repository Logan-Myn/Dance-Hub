const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'image.mux.com',
        pathname: '/**',
      },
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.backblazeb2.com",
        pathname: "/**",
      },
    ],
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
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com https://*.daily.co https://www.gstatic.com https://js.stripe.com https://vercel.live https://*.vercel.live https://accounts.google.com",
              "style-src 'self' 'unsafe-inline' https://accounts.google.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https://*.vercel.app https://*.vercel.live https://vercel.live https://*.supabase.co wss://*.supabase.co https://*.daily.co wss://*.daily.co https://api.daily.co https://*.mux.com https://*.litix.io https://api.stripe.com https://accounts.google.com https://*.backblazeb2.com https://dance-hub.io https://live.nexio.ee wss://live.nexio.ee https://preprod.dance-hub.io",
              "frame-src 'self' https://*.daily.co https://js.stripe.com https://*.stripe.com https://accounts.google.com https://vercel.live https://*.vercel.live",
              "media-src 'self' blob: https://*.daily.co https://*.mux.com https://live.nexio.ee",
              "worker-src 'self' blob:",
            ].join('; ')
          }
        ]
      }
    ];
  },
}

module.exports = withBundleAnalyzer(nextConfig)