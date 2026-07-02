/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs')

const nextConfig = {
  reactStrictMode: true,
  // Ensure client bundle gets public Supabase vars in environments
  // that only set SUPABASE_URL / SUPABASE_ANON_KEY (e.g. some Railway setups).
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '',
    // APP_ENV has no NEXT_PUBLIC_ prefix but lib/config/environment.ts is imported from
    // client components (e.g. Sentry's client config, PostHog gating) — bake it into every
    // bundle the same way NEXT_PUBLIC_SUPABASE_URL above is baked in.
    APP_ENV: process.env.APP_ENV || '',
  },
  // Optimize build performance
  swcMinify: true,
  // Enable type checking in production builds
  typescript: {
    // Opt in with NEXT_IGNORE_TYPECHECK=1 (e.g. emergency CI); never tie to NODE_ENV — .env NODE_ENV breaks builds
    ignoreBuildErrors: process.env.NEXT_IGNORE_TYPECHECK === '1',
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_IGNORE_ESLINT === '1',
  },
  // Security headers (production only). Skip on dev — CSP upgrade-insecure-requests breaks http://localhost.
  // For `/_next/static/*`, avoid CORP + upgrade-insecure-requests: they can block or confuse loading of JS/CSS
  // chunks behind some proxies/CDNs (unstyled UI, failed webpack.js / layout.css in Network tab).
  async headers() {
    if (process.env.NODE_ENV !== 'production') {
      return []
    }
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            // Deprecated header; '0' is the OWASP-recommended value — the legacy
            // auditor it enables can itself introduce XS-Leaks in old browsers.
            key: 'X-XSS-Protection',
            value: '0',
          },
          {
            // Never leak path/query (may contain record ids) to external origins.
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            // Allow camera/mic for this app and embedded Daily.co iframes
            value: 'camera=*, microphone=*, geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.daily.co https://*.sentry.io",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // pdf.js (I-693 editor) embeds standard PDF fonts as data: WOFF2 URIs
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' https://*.supabase.co https://*.daily.co wss://*.daily.co https://*.sentry.io",
              // blob: — prescription print fallback iframe (when pop-up is blocked)
              "frame-src 'self' blob: https://*.daily.co",
              "media-src 'self' https://*.daily.co blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join('; '),
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            // Daily.co video iframe needs to load cross-origin resources
            value: 'unsafe-none',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ]
  },
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      '@supabase/ssr',
      '@supabase/supabase-js',
      'mupdf',
      'pdf-lib',
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        // @logtail/node (server-only Better Stack log forwarding) leaks into the client
        // bundle via lib/api-error-handler.ts -> lib/encounter/complete-encounter.ts.
        http: false,
        https: false,
        zlib: false,
      }
      // "node:" scheme imports bypass resolve.fallback entirely (webpack treats them as a
      // URI scheme, not a module specifier) — rewrite to the bare specifier so the fallback above applies.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '')
        })
      )
    } else {
      config.externals = [...(config.externals || []), 'mupdf']
    }
    return config
  },
}

module.exports = withSentryConfig(
  nextConfig,
  {
    // Sentry webpack plugin options
    silent: true,
    org: process.env.SENTRY_ORG || 'myclinicmd',
    project: process.env.SENTRY_PROJECT || 'javascript-nextjs',
    
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options
    
    // Suppresses source map uploading logs during build
    hideSourceMaps: true,
  },
  {
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
    
    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,
    
    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: '/monitoring',
    
    // Hides source maps from generated client bundles
    hideSourceMaps: true,
  }
)
