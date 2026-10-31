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
    serverActions: { bodySizeLimit: '2mb' },
    // จำหน้าที่เพิ่งเปิดไว้ในเบราว์เซอร์ชั่วคราว กลับไปแท็บเดิมแล้วขึ้นทันทีไม่ต้องโหลดใหม่
    // (บันทึกข้อมูลผ่านฟอร์มจะล้างค่าที่จำไว้เองทุกครั้ง จึงไม่เห็นข้อมูลเก่าหลังแก้ไข)
    staleTimes: { dynamic: 30, static: 60 }
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: supabaseHost }] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  }
};

export default nextConfig;
