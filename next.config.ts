import type { NextConfig } from 'next';

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost').host;
  } catch {
    return 'localhost';
  }
})();

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  // CI ตรวจ type แยกทุกครั้ง (npm run typecheck) จึงไม่ให้ type error ทำให้การ deploy ล้ม
  // ตั้ง STRICT_TYPES=1 เพื่อให้ next build ตรวจ type ด้วย
  typescript: { ignoreBuildErrors: process.env.STRICT_TYPES !== '1' },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' }
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: supabaseHost }] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  }
};

export default nextConfig;
