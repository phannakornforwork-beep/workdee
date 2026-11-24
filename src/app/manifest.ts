import type { MetadataRoute } from 'next';

// ติดตั้งเป็นแอปบนหน้าจอโทรศัพท์ได้ (Add to Home Screen) โดยไม่ต้องทำแอปแยก
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WorkDee · พิสูจน์ฝีมือก่อนสัมภาษณ์',
    short_name: 'WorkDee',
    description: 'หางานด้วยโจทย์สั้นๆ จากงานจริง ได้คำตอบทุกใบสมัครใน 7 วัน',
    start_url: '/spaces',
    display: 'standalone',
    background_color: '#f7f4ec',
    theme_color: '#0b0c0d',
    lang: 'th',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
  };
}
