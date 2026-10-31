// สร้างข้อมูลเดโมสำหรับวันนำเสนอ ผ่าน API จริงของ Supabase (กติกาทุกข้อในฐานข้อมูลยังทำงาน)
// Seeds a believable demo: three verified companies, open jobs, a team workspace and
// candidates at every hiring stage. Runs with Node 20+ and no packages.
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//   SUPABASE_SECRET_KEY=sb_secret_... \
//   DEMO_PASSWORD='รหัสผ่านอย่างน้อย 8 ตัว' \
//   node scripts/seed-demo.mjs
//
// หรือรันจาก GitHub: Actions → Seed demo data (ดู docs/SETUP.md ขั้นที่ 6.5)
// รันครั้งเดียวต่อฐานข้อมูล ถ้าพบบัญชีเดโมอยู่แล้วจะหยุดโดยไม่สร้างซ้ำ

const URL_BASE = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const PUBLIC_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PASSWORD = process.env.DEMO_PASSWORD || '';
const DOMAIN = process.env.DEMO_EMAIL_DOMAIN || 'example.com';

function need(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}
need(URL_BASE, 'ตั้ง SUPABASE_URL');
need(PUBLIC_KEY, 'ตั้ง SUPABASE_PUBLISHABLE_KEY (หรือ anon key)');
need(SECRET, 'ตั้ง SUPABASE_SECRET_KEY (หรือ service_role key)');
need(PASSWORD.length >= 8, 'ตั้ง DEMO_PASSWORD อย่างน้อย 8 ตัวอักษร (ใช้ล็อกอินบัญชีเดโมทุกบัญชี)');

// คีย์ลับแบบใหม่ (sb_secret_) ส่งใน apikey อย่างเดียว คีย์แบบเดิมเป็น JWT ส่งใน Authorization ได้ด้วย
const serviceHeaders = { apikey: SECRET, 'Content-Type': 'application/json' };
if (SECRET.startsWith('eyJ')) serviceHeaders.Authorization = `Bearer ${SECRET}`;

async function call(method, path, { token, body, prefer } = {}) {
  const headers = token
    ? { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { ...serviceHeaders };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.message || data?.msg || data?.error_description || text}`);
  return data;
}

const rpc = (who, fn, args = {}) => call('POST', `/rest/v1/rpc/${fn}`, { token: who.token, body: args });
const svcSelect = (q) => call('GET', `/rest/v1/${q}`);
const svcPatch = (q, body) => call('PATCH', `/rest/v1/${q}`, { body, prefer: 'return=minimal' });
const svcInsert = (table, body) => call('POST', `/rest/v1/${table}`, { body, prefer: 'return=minimal' });
const upsertAs = (who, table, body) =>
  call('POST', `/rest/v1/${table}`, { token: who.token, body, prefer: 'resolution=merge-duplicates,return=minimal' });

const email = (slug) => `demo.${slug}@${DOMAIN}`;

async function account(slug, name) {
  const user = await call('POST', '/auth/v1/admin/users', {
    body: { email: email(slug), password: PASSWORD, email_confirm: true, user_metadata: { display_name: name, accepted_terms_at: new Date().toISOString() } }
  });
  const session = await call('POST', '/auth/v1/token?grant_type=password', {
    token: undefined,
    body: { email: email(slug), password: PASSWORD }
  }).catch(async () => {
    // บาง gateway ต้องใช้ publishable key สำหรับการล็อกอิน
    const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email(slug), password: PASSWORD })
    });
    if (!res.ok) throw new Error(`login ${slug} failed: ${await res.text()}`);
    return res.json();
  });
  return { id: user.id ?? user.user?.id, token: session.access_token, name, email: email(slug) };
}

// ปล่อยสิ่งที่อยู่ในช่วงยกเลิกได้ 30 วินาทีให้เห็นทันที (เหมือนเวลาผ่านไปแล้ว)
async function releaseBatches() {
  const past = new Date(Date.now() - 1000).toISOString();
  const now = encodeURIComponent(new Date(Date.now() + 120_000).toISOString());
  for (const t of ['application_events', 'notifications', 'chat_messages']) {
    await svcPatch(`${t}?visible_at=lt.${now}&visible_at=gt.${encodeURIComponent(past)}`, { visible_at: past });
  }
  await svcPatch(`action_batches?undo_until=gt.${encodeURIComponent(past)}`, { undo_until: past });
}

async function verifiedCompany(owner, fields) {
  const regNo = fields.reg_no;
  const id = await rpc(owner, 'create_company', {
    p_name: fields.name, p_reg_no: regNo, p_size: fields.size, p_industry: fields.industry, p_province: fields.province
  });
  await svcPatch(`companies?id=eq.${id}`, { status: 'verified', about: fields.about, reviewed_at: new Date().toISOString() });
  const [root] = await svcSelect(`positions?company_id=eq.${id}&parent_id=is.null&select=id`);
  return { id, root: root.id };
}

async function join(user, owner, companyId, positionId) {
  const code = await rpc(owner, 'create_invite', { p_company: companyId, p_position: positionId });
  await rpc(user, 'accept_invite', { p_code: code });
}

async function candidate(slug, name, profile, education) {
  const u = await account(slug, name);
  await upsertAs(u, 'candidate_profiles', {
    user_id: u.id, full_name: name, province: 'กรุงเทพมหานคร', pref_job_types: ['full_time', 'part_time'], ...profile
  });
  if (education) {
    await call('POST', '/rest/v1/educations', { token: u.token, body: { level: 'bachelor', status: 'graduated', ...education }, prefer: 'return=minimal' });
  }
  return u;
}

// วันเวลาตามเวลาไทย: อีก n วัน เวลา hh:mm
function bangkokAt(daysAhead, hh, mm = 0) {
  const d = new Date(Date.now() + daysAhead * 86400e3);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
  return new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+07:00`).toISOString();
}
const bangkokDate = (daysAhead) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(Date.now() + daysAhead * 86400e3));

const contentChallenge = {
  title: 'วางแผนเปิดตัวสินค้าใหม่ของแบรนด์สมมติบนโซเชียล',
  brief:
    'แบรนด์สมมติ "ครัวบ้านสวน" จะเปิดตัวน้ำจิ้มสูตรใหม่ ขายผ่าน Facebook Page และ LINE OA กลุ่มเป้าหมายคือคนทำงานอายุ 25–40 ปีที่ทำอาหารกินเองที่บ้าน มีงบโฆษณา 5,000 บาทสำหรับสัปดาห์แรก\n\n1) วางแผนโพสต์ 1 สัปดาห์ อย่างน้อย 3 โพสต์\n2) เขียนแคปชันของโพสต์แรก\n3) บอกว่าจะวัดผลสัปดาห์แรกด้วยตัวเลขอะไร',
  deliverable: 'แผนโพสต์ 1 สัปดาห์ + แคปชันโพสต์แรก + ตัวเลขที่ใช้วัดผล',
  time_limit_minutes: 45,
  due_days: 3,
  criteria: [
    { name: 'เข้าใจกลุ่มเป้าหมาย', weight: 40 },
    { name: 'ความชัดเจนของข้อความ', weight: 35 },
    { name: 'การวัดผล', weight: 25 }
  ],
  ai_policy: 'allowed_declare',
  skill_key: 'content-marketing'
};

const logisticsChallenge = {
  title: 'จัดลำดับการจัดส่งเมื่อรถขาด 1 คัน',
  brief:
    'คลังสมมติมีออเดอร์ 40 รายการต้องส่งวันนี้ แต่รถส่งของเสีย 1 คันจาก 4 คัน\n\n1) จัดลำดับว่าออเดอร์แบบไหนส่งก่อน\n2) เขียนข้อความแจ้งลูกค้าที่ต้องเลื่อน\n3) บอกว่าจะป้องกันปัญหานี้ครั้งหน้าอย่างไร',
  deliverable: 'ตารางลำดับการส่ง + ข้อความแจ้งลูกค้า 1 ข้อความ',
  time_limit_minutes: 40,
  due_days: 3,
  criteria: [
    { name: 'การจัดลำดับความสำคัญ', weight: 50 },
    { name: 'การสื่อสารกับลูกค้า', weight: 30 },
    { name: 'การป้องกันปัญหา', weight: 20 }
  ],
  ai_policy: 'allowed_declare',
  skill_key: 'operations'
};

async function main() {
  console.log(`→ ${URL_BASE}`);
  const existing = await call('GET', `/auth/v1/admin/users?page=1&per_page=1000`);
  const users = existing.users || existing || [];
  if (users.some((u) => u.email === email('company'))) {
    console.log('ข้อมูลเดโมมีอยู่แล้ว (พบบัญชี ' + email('company') + ') ไม่สร้างซ้ำ');
    return;
  }

  // ---------------------------------------------------------------- บริษัทหลัก
  console.log('• บริษัท สุขใจฟู้ดส์ และทีม');
  const owner = await account('company', 'สมชาย สุขใจ');
  const sukjai = await verifiedCompany(owner, {
    name: 'บริษัท สุขใจฟู้ดส์ จำกัด', reg_no: '0105561234567', size: '20-49', industry: 'อาหารและเครื่องดื่ม', province: 'กรุงเทพมหานคร',
    about: 'ผู้ผลิตน้ำพริกและซอสแบบโฮมเมด ขายผ่านร้านค้าออนไลน์และซูเปอร์มาร์เก็ตทั่วประเทศ ทีมงาน 35 คน'
  });
  const mktHead = await rpc(owner, 'create_position', {
    p_company: sukjai.id, p_parent: sukjai.root, p_title: 'หัวหน้าการตลาด', p_is_department: true,
    p_grants: { team: 1, post: 1, approve_post: 1, screen: 1, offer: 1, members: 1, announce: 1, leave: 1 }
  });
  const mktStaff = await rpc(owner, 'create_position', { p_company: sukjai.id, p_parent: mktHead, p_title: 'Content Creator', p_grants: { team: 1 } });
  const hrPos = await rpc(owner, 'create_position', {
    p_company: sukjai.id, p_parent: sukjai.root, p_title: 'HR และบัญชี', p_grants: { team: 2, post: 2, screen: 2, members: 2, announce: 2 }
  });
  const head = await account('head', 'วิทย์ ศักดิ์ดี');
  const hr = await account('hr', 'กมลชนก วงศ์ดี');
  const staff = await account('staff', 'มาลี รักงาน');
  await join(head, owner, sukjai.id, mktHead);
  await join(hr, owner, sukjai.id, hrPos);
  await join(staff, owner, sukjai.id, mktStaff);

  const project = await rpc(head, 'save_project', { p_company: sukjai.id, p_project: null, p_name: 'เปิดตัวน้ำจิ้มสูตรใหม่' });
  const t1 = await rpc(head, 'save_task', {
    p_company: sukjai.id, p_task: null, p_fields: { title: 'ถ่ายวิดีโอสูตรเมนู 3 คลิป', assignee_id: staff.id, project_id: project, due_date: bangkokDate(4) }
  });
  await rpc(staff, 'save_task', { p_company: sukjai.id, p_task: t1, p_fields: { status: 'blocked', blocked_note: 'รอสินค้าตัวอย่างจากโรงงาน' } });
  await rpc(head, 'save_task', {
    p_company: sukjai.id, p_task: null, p_fields: { title: 'เขียนแคปชันโพสต์เปิดตัว', assignee_id: staff.id, project_id: project, due_date: bangkokDate(2) }
  });
  await rpc(staff, 'request_leave', { p_company: sukjai.id, p_type: 'personal', p_start: bangkokDate(5), p_end: bangkokDate(5), p_reason: 'ไปรับปริญญาน้อง' });

  // ---------------------------------------------------------------- ประกาศงาน
  console.log('• ประกาศงาน');
  const contentJob = await rpc(owner, 'save_job', {
    p_company: sukjai.id, p_job: null,
    p_fields: {
      title: 'เจ้าหน้าที่การตลาดออนไลน์ (Content)', job_type: 'full_time', department_id: mktHead, work_mode: 'hybrid',
      description: 'ดูแลคอนเทนต์ Facebook, TikTok และ LINE OA ของแบรนด์ ทำงานกับทีมการตลาด 4 คน',
      responsibilities: 'วางแผนและเขียนคอนเทนต์รายสัปดาห์\nตอบแชตลูกค้าใน LINE OA ร่วมกับทีม\nสรุปผลโพสต์และยอดขายรายเดือน',
      requirements: 'จบใหม่ได้ ไม่ต้องมีประสบการณ์\nเขียนภาษาไทยได้ดี\nใช้ Canva หรือ CapCut ได้',
      skills: ['Content Writing', 'Facebook Ads', 'Canva', 'LINE OA'], province: 'กรุงเทพมหานคร',
      salary_min: 18000, salary_max: 22000, challenge_seats: 10
    }
  });
  await rpc(owner, 'save_challenge', { p_job: contentJob, p_fields: contentChallenge });
  await rpc(owner, 'submit_job', { p_job: contentJob });

  const salesJob = await rpc(owner, 'save_job', {
    p_company: sukjai.id, p_job: null,
    p_fields: {
      title: 'ผู้ช่วยขายออนไลน์ (Part-time เสาร์–อาทิตย์)', job_type: 'part_time', department_id: mktHead, work_mode: 'remote',
      description: 'ตอบแชตลูกค้าและสรุปออเดอร์จาก Shopee และ LINE OA ช่วงวันหยุด',
      requirements: 'นักศึกษาสมัครได้\nพิมพ์เร็ว สุภาพ', skills: ['Customer Service', 'LINE OA'],
      province: 'กรุงเทพมหานคร', salary_min: 80, salary_max: 100, pay_unit: 'hour'
    }
  });
  await rpc(owner, 'submit_job', { p_job: salesJob });

  const cafeOwner = await account('cafe', 'อรวรรณ บ้านสวน');
  const cafe = await verifiedCompany(cafeOwner, {
    name: 'บ้านสวนคาเฟ่', reg_no: '0505563000123', size: '1-19', industry: 'ร้านอาหารและคาเฟ่', province: 'เชียงใหม่',
    about: 'คาเฟ่และร้านเบเกอรี่ 2 สาขาในเชียงใหม่'
  });
  const cafeJob = await rpc(cafeOwner, 'save_job', {
    p_company: cafe.id, p_job: null,
    p_fields: {
      title: 'ผู้ช่วยดูแลโซเชียลมีเดียร้าน (ฝึกงาน)', job_type: 'internship', department_id: cafe.root, work_mode: 'onsite',
      description: 'ถ่ายรูปเมนู เขียนโพสต์ และดูแลรีวิวของร้าน', skills: ['Photography', 'Content Writing', 'Instagram'],
      province: 'เชียงใหม่', salary_min: 8000, salary_max: 10000
    }
  });
  await rpc(cafeOwner, 'save_challenge', {
    p_job: cafeJob,
    p_fields: { ...contentChallenge, title: 'วางแผนโพสต์เมนูใหม่ประจำฤดูหนาว', brief: 'คาเฟ่สมมติจะออกเมนูเครื่องดื่มร้อน 3 เมนู ให้วางแผนโพสต์ 1 สัปดาห์และเขียนแคปชัน 1 โพสต์', skill_key: 'social-media' }
  });
  await rpc(cafeOwner, 'submit_job', { p_job: cafeJob });

  const logiOwner = await account('logistics', 'ประเสริฐ ขนส่งดี');
  const logi = await verifiedCompany(logiOwner, {
    name: 'บริษัท ไทยโลจิสติกส์ พลัส จำกัด', reg_no: '0115562009876', size: '50-199', industry: 'ขนส่งและคลังสินค้า', province: 'สมุทรปราการ',
    about: 'บริการคลังสินค้าและจัดส่งสำหรับร้านค้าออนไลน์'
  });
  const logiJob = await rpc(logiOwner, 'save_job', {
    p_company: logi.id, p_job: null,
    p_fields: {
      title: 'ผู้ประสานงานคลังสินค้า', job_type: 'full_time', department_id: logi.root, work_mode: 'onsite',
      description: 'ประสานงานการรับ–ส่งสินค้า ดูแลตารางรถ และแจ้งลูกค้าเมื่อมีการเปลี่ยนแปลง',
      skills: ['Excel', 'Communication', 'Logistics'], province: 'สมุทรปราการ', salary_min: 17000, salary_max: 20000
    }
  });
  await rpc(logiOwner, 'save_challenge', { p_job: logiJob, p_fields: logisticsChallenge });
  await rpc(logiOwner, 'submit_job', { p_job: logiJob });

  // ---------------------------------------------------------------- ผู้สมัคร
  console.log('• ผู้สมัคร');
  const c1 = await candidate(
    'candidate', 'พิมพ์ชนก ใจดี',
    {
      headline: 'นักการตลาดจบใหม่ ชอบเขียนคอนเทนต์อาหาร', intro: 'ทำเพจรีวิวอาหารของตัวเองมา 2 ปี มีผู้ติดตาม 3,200 คน ชอบทดลองทำคลิปสั้นและวัดผลจากตัวเลข',
      skills: ['Content Writing', 'Facebook Ads', 'Canva', 'CapCut'], tools: ['Canva', 'CapCut', 'Meta Business Suite'],
      languages: [{ name: 'อังกฤษ', detail: 'TOEIC 785' }],
      projects: [{ title: 'เพจรีวิวอาหาร "อิ่มใจ"', detail: 'ดูแลคนเดียว โพสต์สัปดาห์ละ 3 ครั้ง ยอดเข้าถึงเฉลี่ย 8,000 ต่อโพสต์' }],
      expected_salary: 20000
    },
    { institution_name: 'มหาวิทยาลัยศรีนครินทรวิโรฒ', faculty: 'บริหารธุรกิจ', major: 'การตลาด', year_label: '2569', gpa: 3.42 }
  );
  await upsertAs(c1, 'career_plans', { user_id: c1.id, goal_title: 'Content Lead ภายใน 3 ปี', share_with_companies: true });
  const c2 = await candidate(
    'c2', 'ธนกร ศรีสุข',
    { headline: 'นักศึกษานิเทศฯ ปีสุดท้าย', intro: 'ถนัดเขียนสคริปต์คลิปสั้น', skills: ['Content Writing', 'TikTok', 'Video'], tools: ['CapCut'] },
    { institution_name: 'มหาวิทยาลัยกรุงเทพ', faculty: 'นิเทศศาสตร์', major: 'โฆษณา', status: 'studying', year_label: 'ปี 4' }
  );
  const c3 = await candidate('c3', 'ณัฐธิดา แก้วมณี', {
    headline: 'จบบริหารธุรกิจ สนใจการตลาดดิจิทัล', intro: 'เคยฝึกงานฝ่ายขายออนไลน์ 3 เดือน', skills: ['Facebook Ads', 'Excel', 'LINE OA'], tools: ['Excel']
  });
  const c4 = await candidate('c4', 'วรเมธ ทองดี', {
    headline: 'ช่างภาพและตัดต่อวิดีโอ', intro: 'รับงานถ่ายภาพอาหารฟรีแลนซ์', skills: ['Video', 'Photography'], tools: ['Premiere Pro']
  });

  const apps = {};
  for (const [k, c] of Object.entries({ c1, c2, c3, c4 })) {
    apps[k] = await rpc(c, 'apply_to_job', {
      p_job: contentJob, p_intro: 'สนใจตำแหน่งนี้มาก อยากเรียนรู้กับทีมการตลาดของสุขใจฟู้ดส์', p_expected_salary: 20000, p_share_plan: k === 'c1'
    });
  }
  await rpc(c3, 'apply_to_job', { p_job: salesJob, p_intro: 'ว่างเสาร์–อาทิตย์ค่ะ' });

  console.log('• รอบโจทย์และคะแนน');
  await rpc(hr, 'invite_to_challenge', {
    p_apps: [apps.c1, apps.c2, apps.c3], p_message: 'สวัสดีค่ะคุณ{ชื่อ} ขอเชิญทำโจทย์ตำแหน่ง{ตำแหน่ง} ใช้เวลาประมาณ 45 นาทีค่ะ'
  });
  await releaseBatches();
  await rpc(c1, 'start_challenge', { p_app: apps.c1 });
  await rpc(c1, 'submit_challenge', {
    p_app: apps.c1,
    p_answer:
      'จันทร์: ทีเซอร์ภาพขวดน้ำจิ้มปิดฉลาก ชวนทาย\nพุธ: คลิปสั้น 30 วินาที "3 เมนูเย็นนี้ใน 10 นาที"\nศุกร์: เปิดตัว + โปรแถมฟรีเมื่อสั่งผ่าน LINE OA\n\nแคปชัน: เย็นนี้กินอะไรดี? ไม่ต้องคิดนาน น้ำจิ้มสูตรใหม่จากครัวบ้านสวน ราดปุ๊บอร่อยปั๊บ ทักแชตรับสูตร 3 เมนูฟรี\n\nวัดผล: จำนวนคนทักแชต LINE OA และยอดสั่งซื้อจากลิงก์',
    p_reasoning: 'กลุ่มเป้าหมายทำงานเหนื่อยและอยากได้เมนูง่าย จึงเน้นสูตรเร็วและพาเข้า LINE OA เพราะวัดยอดขายได้ตรงที่สุด',
    p_ai_use: 'ideas', p_ai_detail: 'ใช้ช่วยคิดชื่อเมนู แล้วเขียนแคปชันเอง'
  });
  await rpc(c2, 'start_challenge', { p_app: apps.c2 });
  await rpc(c2, 'submit_challenge', {
    p_app: apps.c2, p_answer: 'กินข้าวกับอะไรดี? แผนคลิป TikTok 5 วัน ตอบคำถามที่คนถามทุกวันด้วยน้ำจิ้มสูตรใหม่', p_reasoning: 'คนดูคลิปสั้นช่วงเย็นมากที่สุด', p_ai_use: 'none'
  });
  await rpc(hr, 'grade_challenge', {
    p_app: apps.c1,
    p_scores: [{ name: 'เข้าใจกลุ่มเป้าหมาย', score: 36 }, { name: 'ความชัดเจนของข้อความ', score: 30 }, { name: 'การวัดผล', score: 22 }],
    p_feedback: 'เข้าใจกลุ่มเป้าหมายดีมาก และเลือกตัวเลขวัดผลที่ใช้ได้จริง'
  });

  console.log('• นัดสัมภาษณ์');
  await rpc(hr, 'create_interview_slots', {
    p_company: sukjai.id, p_job: contentJob,
    p_slots: [
      { starts_at: bangkokAt(4, 10), minutes: 45, mode: 'online', meeting_url: 'https://meet.google.com/' },
      { starts_at: bangkokAt(4, 14), minutes: 45, mode: 'onsite', location: 'สำนักงานใหญ่ ลาดพร้าว' },
      { starts_at: bangkokAt(5, 10), minutes: 45, mode: 'online', meeting_url: 'https://meet.google.com/' }
    ]
  });
  const slots = await svcSelect(`interview_slots?job_id=eq.${contentJob}&select=id&order=starts_at`);
  await rpc(hr, 'invite_to_interview', { p_apps: [apps.c1], p_slot_ids: slots.map((s) => s.id) });
  await releaseBatches();

  // ---------------------------------------------------------------- สรุป
  console.log('\n✓ สร้างข้อมูลเดโมเรียบร้อย ทุกบัญชีใช้รหัสผ่านเดียวกับ DEMO_PASSWORD');
  console.log(`  ฝั่งบริษัท (เจ้าของ สุขใจฟู้ดส์)  ${email('company')}`);
  console.log(`  ฝั่งบริษัท (HR)                ${email('hr')}`);
  console.log(`  ฝั่งผู้หางาน (พิมพ์ชนก)         ${email('candidate')}`);
  console.log('  พิมพ์ชนก: ได้คะแนนโจทย์ 88/100 และรอเลือกเวลาสัมภาษณ์ (กดเลือกสดได้ตอนนำเสนอ)');
  console.log('  ธนกร: ส่งโจทย์แล้ว รอบริษัทให้คะแนน · ณัฐธิดา: ได้รับเชิญทำโจทย์ · วรเมธ: เพิ่งสมัคร รอบริษัทตอบ');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
