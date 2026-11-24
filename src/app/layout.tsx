import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import './globals.css';
// ธีมเรียบตามหลัก JobsDB (ลดตาลาย) — กลับไปธีมกระจกเดิม: เปลี่ยนเป็น import './ios.css' และ './readable.css'
import './clean.css';
import { SITE_URL } from '@/lib/env';

const font = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-thai'
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'WorkDee · พิสูจน์ฝีมือก่อนสัมภาษณ์', template: '%s · WorkDee' },
  description:
    'WorkDee ช่วยเด็กจบใหม่พิสูจน์กับบริษัทว่าทำงานได้จริงด้วยโจทย์สั้นๆ ก่อนถูกเรียกสัมภาษณ์ และช่วย SME รับคนและบริหารทีมได้ในที่เดียว',
  applicationName: 'WorkDee',
  openGraph: { siteName: 'WorkDee', locale: 'th_TH', type: 'website' }
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#161b23' }
  ],
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={font.variable} suppressHydrationWarning>
      <head>
        {/* ตั้งธีมก่อนหน้าแสดงผล กันหน้าจอกะพริบ */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('workdee-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}"
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
