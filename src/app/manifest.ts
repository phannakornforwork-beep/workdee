import type { MetadataRoute } from 'next';

// ติดตั้งเป็นแอปบนหน้าจอโฮมได้ (Add to Home Screen) โดยไม่ต้องผ่าน App Store
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WorkDee · พิสูจน์ฝีมือก่อนสัมภาษณ์',
    short_name: 'WorkDee',
    description: 'หางานที่ได้คำตอบใน 7 วัน และพิสูจน์ฝีมือด้วยโจทย์สั้นๆ',
    start_url: '/spaces',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0d1d42',
    lang: 'th',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
  };
}
