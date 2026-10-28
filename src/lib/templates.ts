// เทมเพลตประกาศงานพร้อมโจทย์ (แบรนด์สมมติ) ให้บริษัทแก้ต่อได้ ไม่ต้องเขียนเองตั้งแต่ศูนย์
export type JobTemplate = {
  key: string;
  label: string;
  job: Record<string, string | number>;
  challenge: { title: string; brief: string; deliverable: string; minutes: number; due_days: number; skill_key: string; criteria: { name: string; weight: number }[] };
};

export const JOB_TEMPLATES: JobTemplate[] = [
  {
    key: 'content',
    label: 'เจ้าหน้าที่การตลาดออนไลน์ (Content)',
    job: {
      title: 'เจ้าหน้าที่การตลาดออนไลน์ (Content)',
      job_type: 'full_time',
      description: 'วางแผนและผลิตคอนเทนต์ให้แบรนด์บนโซเชียลมีเดีย ดูแลเพจและ LINE OA ร่วมกับทีมขายออนไลน์',
      responsibilities: 'เขียนแคปชันและวางแผนโพสต์รายสัปดาห์\nทำภาพหรือวิดีโอสั้นด้วยเครื่องมือพื้นฐาน\nสรุปผลโพสต์และเสนอสิ่งที่ควรปรับ',
      requirements: 'นักศึกษาปี 4 หรือจบใหม่ สายการตลาด นิเทศศาสตร์ หรือใกล้เคียง\nเขียนภาษาไทยได้ดี ใช้ Canva หรือ CapCut ได้',
      skills: 'Content Writing, Facebook Ads, Canva, Google Analytics',
      salary_min: 18000,
      salary_max: 22000,
      work_mode: 'hybrid'
    },
    challenge: {
      title: 'วางแผนเปิดตัวสินค้าใหม่ (แบรนด์สมมติ)',
      brief:
        'แบรนด์สมมติ "ครัวบ้านสวน" จะเปิดตัวน้ำจิ้มสูตรใหม่สำหรับคนทำงานที่ทำอาหารเองตอนเย็น งบโฆษณา 20,000 บาท ระยะเวลา 1 สัปดาห์\nให้วางแผนคอนเทนต์ 7 วัน และเขียนตัวอย่างโพสต์ 1 ชิ้น',
      deliverable: 'แผนคอนเทนต์ 7 วัน (1 หน้า) + ตัวอย่างโพสต์ 1 ชิ้น + วิธีวัดผล',
      minutes: 60,
      due_days: 3,
      skill_key: 'content-marketing',
      criteria: [
        { name: 'เข้าใจกลุ่มเป้าหมาย', weight: 40 },
        { name: 'ความชัดเจนของข้อความ', weight: 35 },
        { name: 'การวัดผล', weight: 25 }
      ]
    }
  },
  {
    key: 'graphic',
    label: 'กราฟิกดีไซเนอร์',
    job: {
      title: 'กราฟิกดีไซเนอร์',
      job_type: 'contract',
      description: 'ออกแบบสื่อโฆษณาออนไลน์และบรรจุภัณฑ์ให้สอดคล้องกับภาพลักษณ์แบรนด์',
      responsibilities: 'ออกแบบโพสต์ แบนเนอร์ และสตอรี่\nปรับไฟล์ให้เหมาะกับแต่ละช่องทาง\nดูแลคู่มือการใช้สีและฟอนต์ของแคมเปญ',
      requirements: 'ใช้ Adobe Illustrator / Photoshop หรือ Figma ได้\nมีผลงานให้ดู (งานมหาวิทยาลัยก็ได้)',
      skills: 'Adobe Illustrator, Photoshop, Figma',
      salary_min: 16000,
      salary_max: 20000,
      work_mode: 'onsite'
    },
    challenge: {
      title: 'ออกแบบโปสเตอร์โปรโมชัน (แบรนด์สมมติ)',
      brief: 'ร้านเครื่องดื่มสมมติ "ชาบ้านไร่" จัดโปรซื้อ 1 แถม 1 สุดสัปดาห์นี้ ออกแบบโปสเตอร์สำหรับโพสต์และสตอรี่ ต้องอ่านง่ายบนมือถือ',
      deliverable: 'ไฟล์ภาพโพสต์ 1:1 และสตอรี่ 9:16 พร้อมคำอธิบายแนวคิดสั้นๆ',
      minutes: 90,
      due_days: 3,
      skill_key: 'graphic-design',
      criteria: [
        { name: 'เหมาะกับแบรนด์', weight: 40 },
        { name: 'อ่านง่ายบนมือถือ', weight: 30 },
        { name: 'ความคิดสร้างสรรค์', weight: 30 }
      ]
    }
  },
  {
    key: 'gig-sales',
    label: 'ผู้ช่วยขายออนไลน์ช่วงโปรโมชัน (จ็อบระยะสั้น)',
    job: {
      title: 'ผู้ช่วยขายออนไลน์ช่วงโปรโมชันปลายปี',
      job_type: 'gig',
      description: 'ตอบแชตลูกค้าและช่วยปิดการขายช่วงแคมเปญ 11.11 และ 12.12',
      responsibilities: 'ตอบแชตลูกค้าตามสคริปต์และนโยบายร้าน\nบันทึกออร์เดอร์และส่งต่อทีมคลังสินค้า',
      requirements: 'ตอบแชตสุภาพ พิมพ์เร็ว มีเวลาทำงานต่อเนื่องตามวันที่กำหนด',
      skills: 'การบริการลูกค้า, ขายออนไลน์',
      salary_min: 650,
      salary_max: 750,
      pay_unit: 'day',
      gig_days: 20,
      work_mode: 'remote'
    },
    challenge: {
      title: 'ตอบแชตลูกค้า 5 สถานการณ์',
      brief: 'ร้านเสื้อผ้าออนไลน์สมมติ "ผ้าดี" ได้รับแชต 5 แบบ: ถามไซซ์ ของไม่ตรงปก ขอส่วนลด เร่งส่งของ และลูกค้าไม่พอใจ เขียนคำตอบแต่ละแชตให้สุภาพและแก้ปัญหาได้',
      deliverable: 'คำตอบ 5 ข้อ ข้อละไม่เกิน 4 บรรทัด',
      minutes: 30,
      due_days: 2,
      skill_key: 'customer-chat',
      criteria: [
        { name: 'ความสุภาพ', weight: 30 },
        { name: 'แก้ปัญหาได้ตรงจุด', weight: 40 },
        { name: 'ปิดการขาย', weight: 30 }
      ]
    }
  }
];
