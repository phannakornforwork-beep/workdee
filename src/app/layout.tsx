import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import './globals.css';
import './ios.css';
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

export const viewport: Viewport = { themeColor: '#F2F2F7', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={font.variable}>
      <body>{children}</body>
    </html>
  );
}
