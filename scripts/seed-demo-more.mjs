// ข้อมูลเดโมชุดที่ 2 (เพิ่มต่อจาก seed-demo.mjs ไม่ลบของเดิม) ให้วันนำเสนอมีข้อมูลมากพอโชว์ทุกฟีเจอร์
//   • บริษัทที่ 4 (สตาร์ทอัพ) และประกาศงานเพิ่ม 5 ตำแหน่ง รวมงานระยะสั้น (gig) และฝึกงาน
//   • ผู้หางานเพิ่ม 10 คน โปรไฟล์และข้อความแนะนำตัวต่างกัน (โชว์การคัดกรองด้วยคีย์เวิร์ด)
//   • ผู้สมัครกระจายทุกขั้น: สมัครใหม่ ทำโจทย์ ส่งแล้วรอคะแนน ได้คะแนน ไม่ผ่านพร้อมเหตุผล
//   • คุณสมบัติสำหรับคัดกรองของประกาศ Content, ใบรับรองภาษา 3 ระดับ, วุฒิที่ตรวจแล้ว
//   • แฟ้มผลงานของ demo.candidate มีคะแนนโจทย์ 4 งานที่ดีขึ้นตามเวลา (โชว์กราฟพัฒนาการ)
//
// ใช้ secret ชุดเดียวกับ seed-demo.mjs · รันซ้ำได้: ข้ามสิ่งที่มีอยู่แล้ว
// GitHub: Actions → Seed more demo data

const URL_BASE = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PASSWORD = process.env.DEMO_PASSWORD || '';
const DOMAIN = process.env.DEMO_EMAIL_DOMAIN || 'example.com';

for (const [ok, msg] of [
  [URL_BASE, 'ตั้ง SUPABASE_URL'],
  [PUBLIC_KEY, 'ตั้ง SUPABASE_PUBLISHABLE_KEY'],
  [SECRET, 'ตั้ง SUPABASE_SECRET_KEY'],
  [PASSWORD.length >= 8, 'ตั้ง DEMO_PASSWORD (ต้องตรงกับที่ใช้ตอนรัน seed-demo ครั้งแรก)']
]) {
  if (!ok) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

const serviceHeaders = { apikey: SECRET, 'Content-Type': 'application/json' };
if (SECRET.startsWith('eyJ')) serviceHeaders.Authorization = `Bearer ${SECRET}`;

async function call(method, path, { token, body, prefer, anon } = {}) {
  const headers = token
    ? { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : anon
      ? { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' }
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
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} → ${res.status} ${data?.message || data?.msg || data?.error_description || text}`);
  return data;
}

const rpc = (who, fn, args = {}) => call('POST', `/rest/v1/rpc/${fn}`, { token: who.token, body: args });
const sel = (q) => call('GET', `/rest/v1/${q}`);
const patch = (q, body) => call('PATCH', `/rest/v1/${q}`, { body, prefer: 'return=minimal' });
const insert = (table, body) => call('POST', `/rest/v1/${table}`, { body, prefer: 'return=minimal' });
const upsertAs = (who, table, body) => call('POST', `/rest/v1/${table}`, { token: who.token, body, prefer: 'resolution=merge-duplicates,return=minimal' });
const email = (slug) => `demo.${slug}@${DOMAIN}`;
// ค่าที่มีวงเล็บหรือจุลภาคต้องครอบด้วย "..." ในตัวกรองของ PostgREST
const q = (v) => encodeURIComponent(`"${v}"`);
const daysAgo = (n, hh = 10) => new Date(Date.now() - n * 86400e3 + (hh - 10) * 3600e3).toISOString();

// ทำต่อได้แม้ขั้นนั้นเคยทำแล้ว (เช่น สมัครซ้ำ เชิญซ้ำ)
async function soft(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.log(`  · ข้าม ${label}: ${String(e.message).slice(0, 140)}`);
    return null;
  }
}

let allUsers = null;
async function findUser(slug) {
  allUsers ||= (await call('GET', '/auth/v1/admin/users?page=1&per_page=1000')).users || [];
  return allUsers.find((u) => u.email === email(slug)) || null;
}

async function login(slug) {
  const s = await call('POST', '/auth/v1/token?grant_type=password', { anon: true, body: { email: email(slug), password: PASSWORD } });
  return s.access_token;
}

async function account(slug, name) {
  let u = await findUser(slug);
  if (!u) {
    u = await call('POST', '/auth/v1/admin/users', {
      body: { email: email(slug), password: PASSWORD, email_confirm: true, user_metadata: { display_name: name, accepted_terms_at: new Date().toISOString() } }
    });
    u = u.user || u;
  }
  return { id: u.id, token: await login(slug), name };
}

async function candidate(slug, name, profile, education) {
  const u = await account(slug, name);
  await upsertAs(u, 'candidate_profiles', {
    user_id: u.id, full_name: name, province: 'กรุงเทพมหานคร', pref_job_types: ['full_time', 'internship', 'gig'], discoverable: true, ...profile
  });
  if (education) {
    const have = await sel(`educations?user_id=eq.${u.id}&select=id`);
    if (!have.length) await call('POST', '/rest/v1/educations', { token: u.token, body: { level: 'bachelor', status: 'graduated', ...education }, prefer: 'return=minimal' });
  }
  return u;
}

async function job(owner, companyId, fields, challenge) {
  const [found] = await sel(`jobs?company_id=eq.${companyId}&title=eq.${q(fields.title)}&select=id,status`);
  if (found) return found.id;
  const id = await rpc(owner, 'save_job', { p_company: companyId, p_job: null, p_fields: fields });
  if (challenge) {
    await rpc(owner, 'save_challenge', {
      p_job: id,
      p_fields: {
        title: challenge.title, brief: challenge.brief, deliverable: challenge.deliverable, time_limit_minutes: challenge.minutes,
        due_days: challenge.due_days, criteria: challenge.criteria, ai_policy: 'allowed_declare', skill_key: challenge.skill_key, accept_reuse: true
      }
    });
  }
  await rpc(owner, 'submit_job', { p_job: id });
  return id;
}

async function apply(c, jobId, intro, salary) {
  const [have] = await sel(`applications?job_id=eq.${jobId}&candidate_id=eq.${c.id}&select=id`);
  if (have) return have.id;
  return rpc(c, 'apply_to_job', { p_job: jobId, p_intro: intro, p_expected_salary: salary ?? null });
}

async function stageOf(appId) {
  const [a] = await sel(`applications?id=eq.${appId}&select=stage`);
  return a?.stage;
}

// ปล่อยสิ่งที่อยู่ในช่วงยกเลิกได้ 30 วินาทีให้เห็นทันที
async function releaseBatches() {
  const past = new Date(Date.now() - 1000).toISOString();
  const soon = encodeURIComponent(new Date(Date.now() + 120_000).toISOString());
  for (const t of ['application_events', 'notifications', 'chat_messages']) await patch(`${t}?visible_at=lt.${soon}&visible_at=gt.${encodeURIComponent(past)}`, { visible_at: past });
  await patch(`action_batches?undo_until=gt.${encodeURIComponent(past)}`, { undo_until: past });
}

/** เชิญ → ผู้สมัครเริ่มและส่ง → (ถ้ามีคะแนน) บริษัทให้คะแนน แล้วย้อนเวลาให้คะแนน (ใช้เรียงในกราฟพัฒนาการ) */
async function runChallenge(screener, c, appId, submission, grade) {
  if ((await stageOf(appId)) === 'applied') {
    await soft('เชิญทำโจทย์', () => rpc(screener, 'invite_to_challenge', { p_apps: [appId], p_message: 'สวัสดีค่ะคุณ{ชื่อ} ขอเชิญทำโจทย์ตำแหน่ง{ตำแหน่ง} ค่ะ' }));
    await releaseBatches();
  }
  if (!submission) return;
  if ((await stageOf(appId)) === 'challenge_invited') {
    await soft('เริ่มโจทย์', () => rpc(c, 'start_challenge', { p_app: appId }));
    await soft('ส่งโจทย์', () =>
      rpc(c, 'submit_challenge', { p_app: appId, p_answer: submission.answer, p_reasoning: submission.reasoning, p_ai_use: submission.ai_use || 'none', p_ai_detail: submission.ai_detail || '' })
    );
  }
  if (!grade) return;
  const [scored] = await sel(`challenge_scores?application_id=eq.${appId}&select=application_id`);
  if (!scored && (await stageOf(appId)) === 'challenge_submitted') {
    await soft('ให้คะแนน', () => rpc(screener, 'grade_challenge', { p_app: appId, p_scores: grade.scores, p_feedback: grade.feedback }));
  }
  if (grade.daysAgo) await soft('ย้อนวันให้คะแนน', () => patch(`challenge_scores?application_id=eq.${appId}`, { graded_at: daysAgo(grade.daysAgo) }));
}

const scoresOf = (criteria, ratios) => criteria.map((c, i) => ({ name: c.name, score: Math.round(c.weight * ratios[i]) }));

// ---------------------------------------------------------------- โจทย์ที่ใช้ในชุดนี้ (แบรนด์สมมติ)
const CH = {
  graphic: {
    title: 'ออกแบบโปสเตอร์โปรโมชันซื้อ 1 แถม 1 (แบรนด์สมมติ)', skill_key: 'graphic-design', minutes: 90, due_days: 3,
    brief: 'ร้านเครื่องดื่มสมมติ "ชาบ้านไร่" จัดโปรซื้อ 1 แถม 1 สุดสัปดาห์นี้ ออกแบบโปสเตอร์สำหรับโพสต์ (1:1) และสตอรี่ (9:16) ต้องอ่านง่ายบนมือถือ',
    deliverable: 'ภาพโพสต์ 1:1 + สตอรี่ 9:16 + คำอธิบายแนวคิดสั้น ๆ',
    criteria: [
      { name: 'อ่านง่ายบนมือถือ', weight: 40, description: 'ข้อความหลักเห็นใน 2 วินาที' },
      { name: 'ความสวยงามและตรงแบรนด์', weight: 35, description: 'สีและตัวอักษรสม่ำเสมอ' },
      { name: 'เหตุผลการออกแบบ', weight: 25, description: 'อธิบายได้ว่าทำไมเลือกแบบนี้' }
    ]
  },
  data: {
    title: 'สรุปยอดขาย 3 เดือนจากไฟล์ Excel', skill_key: 'data-analysis', minutes: 60, due_days: 3,
    brief: 'ร้านค้าออนไลน์สมมติ "บ้านผ้าฝ้าย" มีข้อมูลยอดขาย 3 เดือน (สินค้า ช่องทาง วันที่ ยอดเงิน) สรุปว่าสินค้าและช่องทางไหนขายดี และเสนอ 3 สิ่งที่ควรทำเดือนหน้า',
    deliverable: 'ไฟล์ Excel/Sheets พร้อม Pivot หรือกราฟ + สรุป 1 หน้า',
    criteria: [
      { name: 'ความถูกต้องของตัวเลข', weight: 40, description: 'สรุปยอดถูกต้อง ตรวจซ้ำได้' },
      { name: 'การนำเสนอข้อมูล', weight: 30, description: 'กราฟหรือตารางอ่านง่าย' },
      { name: 'ข้อเสนอที่ทำได้จริง', weight: 30, description: 'ข้อเสนออ้างอิงจากตัวเลข' }
    ]
  },
  service: {
    title: 'แก้ปัญหาลูกค้าร้องเรียนสินค้าเสียหาย', skill_key: 'customer-recovery', minutes: 45, due_days: 2,
    brief: 'ลูกค้าของร้านออนไลน์สมมติ "ครัวสุข" ได้รับขวดซอสแตก 2 ขวด และโพสต์รีวิว 1 ดาว เขียนข้อความตอบลูกค้าในแชต ข้อความตอบรีวิวสาธารณะ และขั้นตอนป้องกันไม่ให้เกิดซ้ำ',
    deliverable: 'ข้อความ 2 ชิ้น + ขั้นตอนป้องกัน 3–5 ข้อ',
    criteria: [
      { name: 'เข้าใจความรู้สึกลูกค้า', weight: 35, description: 'ขอโทษจริงใจ ไม่โทษลูกค้า' },
      { name: 'ทางแก้ชัดเจน', weight: 35, description: 'บอกสิ่งที่ร้านจะทำและเมื่อไร' },
      { name: 'ป้องกันซ้ำ', weight: 30, description: 'ขั้นตอนทำได้จริงในร้านเล็ก' }
    ]
  },
  react: {
    title: 'หน้ารายการสินค้าค้นหาและกรองได้ด้วย React', skill_key: 'frontend-react', minutes: 180, due_days: 5,
    brief: 'แอปสมมติ "ออมดี" ต้องการหน้าแสดงแพ็กเกจเงินออม 20 รายการ (JSON ที่ให้) ที่ค้นหาและกรองตามระยะเวลาได้ บนมือถือต้องใช้ง่าย',
    deliverable: 'ลิงก์ GitHub + ลิงก์เดโม + README สั้น ๆ',
    criteria: [
      { name: 'ทำงานได้ครบตามโจทย์', weight: 40, description: 'ค้นหาและกรองถูกต้อง' },
      { name: 'คุณภาพโค้ด', weight: 35, description: 'อ่านง่าย แบ่งส่วนดี ตั้งชื่อชัด' },
      { name: 'การอธิบายงาน', weight: 25, description: 'README บอกวิธีรันและสิ่งที่ตัดสินใจ' }
    ]
  }
};

async function main() {
  console.log(`→ ${URL_BASE}`);
  if (!(await findUser('company'))) {
    console.error('✗ ยังไม่มีข้อมูลเดโมชุดแรก รัน "Seed demo data" ก่อน');
    process.exit(1);
  }

  // ---------------------------------------------------------------- บัญชีเดิม
  const owner = await account('company', 'สมชาย สุขใจ');
  const hr = await account('hr', 'กมลชนก วงศ์ดี');
  const cafeOwner = await account('cafe', 'อรวรรณ บ้านสวน');
  const logiOwner = await account('logistics', 'ประเสริฐ ขนส่งดี');
  const c1 = await account('candidate', 'พิมพ์ชนก ใจดี');
  const c2 = await account('c2', 'ธนกร ศรีสุข');
  const c3 = await account('c3', 'ณัฐธิดา แก้วมณี');
  const c4 = await account('c4', 'วรเมธ ทองดี');

  const [sukjai] = await sel(`companies?name=eq.${q('บริษัท สุขใจฟู้ดส์ จำกัด')}&select=id`);
  const [cafe] = await sel(`companies?name=eq.${q('บ้านสวนคาเฟ่')}&select=id`);
  const [logi] = await sel(`companies?name=eq.${q('บริษัท ไทยโลจิสติกส์ พลัส จำกัด')}&select=id`);
  const [mktHead] = await sel(`positions?company_id=eq.${sukjai.id}&title=eq.${q('หัวหน้าการตลาด')}&select=id`);
  const [cafeRoot] = await sel(`positions?company_id=eq.${cafe.id}&parent_id=is.null&select=id`);
  const [logiRoot] = await sel(`positions?company_id=eq.${logi.id}&parent_id=is.null&select=id`);
  const [contentJob] = await sel(`jobs?company_id=eq.${sukjai.id}&title=eq.${q('เจ้าหน้าที่การตลาดออนไลน์ (Content)')}&select=id`);
  const [salesJob] = await sel(`jobs?company_id=eq.${sukjai.id}&title=like.${encodeURIComponent('ผู้ช่วยขายออนไลน์*')}&select=id`);
  const [contentCh] = await sel(`challenges?job_id=eq.${contentJob.id}&select=criteria`);

  // ---------------------------------------------------------------- บริษัทที่ 4
  console.log('• บริษัทสตาร์ทอัพ ออมดี เทคโนโลยี');
  const startupOwner = await account('startup', 'ณัฐวุฒิ ออมดี');
  let [startup] = await sel(`companies?reg_no=eq.0105566012345&select=id`);
  if (!startup) {
    const id = await rpc(startupOwner, 'create_company', {
      p_name: 'บริษัท ออมดี เทคโนโลยี จำกัด', p_reg_no: '0105566012345', p_size: '20-49', p_industry: 'เทคโนโลยีการเงิน', p_province: 'กรุงเทพมหานคร'
    });
    await patch(`companies?id=eq.${id}`, { status: 'verified', about: 'แอปช่วยคนจบใหม่ออมเงินและวางแผนการเงิน ผู้ใช้ 120,000 คน ทีม 28 คน', reviewed_at: new Date().toISOString() });
    startup = { id };
  }
  const [startupRoot] = await sel(`positions?company_id=eq.${startup.id}&parent_id=is.null&select=id`);

  // ---------------------------------------------------------------- ประกาศงานเพิ่ม
  console.log('• ประกาศงานเพิ่ม 5 ตำแหน่ง');
  const graphicJob = await job(owner, sukjai.id, {
    title: 'กราฟิกดีไซเนอร์ (สัญญาจ้าง 6 เดือน)', job_type: 'contract', department_id: mktHead.id, work_mode: 'hybrid',
    description: 'ออกแบบโพสต์ แบนเนอร์ และฉลากสินค้าตัวใหม่ร่วมกับทีมการตลาด', responsibilities: 'ออกแบบสื่อโซเชียลสัปดาห์ละ 8–10 ชิ้น\nปรับไฟล์ให้เหมาะกับแต่ละช่องทาง',
    requirements: 'ต้องมี: ใช้ Canva หรือ Figma หรือ Illustrator ได้\nต้องมี: มีผลงานให้ดู (งานมหาวิทยาลัยก็ได้)\nมีแล้วดี: ถ่ายภาพสินค้าได้',
    skills: ['Canva', 'Figma', 'Illustrator', 'Photography'], province: 'กรุงเทพมหานคร', salary_min: 20000, salary_max: 25000, challenge_seats: 8
  }, CH.graphic);
  const serviceJob = await job(owner, sukjai.id, {
    title: 'เจ้าหน้าที่ดูแลลูกค้าออนไลน์ (LINE OA / Shopee)', job_type: 'full_time', department_id: mktHead.id, work_mode: 'remote',
    description: 'ตอบแชตลูกค้า จัดการคำสั่งซื้อและเคสร้องเรียนบน LINE OA และ Shopee', requirements: 'ต้องมี: สื่อสารสุภาพ พิมพ์เร็ว\nมีแล้วดี: เคยเป็นแอดมินร้านออนไลน์',
    skills: ['Customer Service', 'LINE OA', 'Shopee'], province: 'กรุงเทพมหานคร', salary_min: 16000, salary_max: 19000
  }, CH.service);
  const dataJob = await job(logiOwner, logi.id, {
    title: 'นักวิเคราะห์ข้อมูลการขาย (Data Analyst)', job_type: 'full_time', department_id: logiRoot.id, work_mode: 'hybrid',
    description: 'สรุปยอดขายและต้นทุนขนส่งของลูกค้ารายเดือน ทำ Dashboard ให้ฝ่ายขาย', requirements: 'ต้องมี: Excel ขั้นกลาง (Pivot, XLOOKUP)\nมีแล้วดี: Power BI หรือ SQL',
    skills: ['Excel', 'Power BI', 'SQL'], province: 'สมุทรปราการ', salary_min: 22000, salary_max: 28000
  }, CH.data);
  const gigJob = await job(cafeOwner, cafe.id, {
    title: 'ถ่ายภาพเมนูใหม่และตัดคลิปสั้น (งานระยะสั้น 3 วัน)', job_type: 'gig', department_id: cafeRoot.id, work_mode: 'onsite',
    description: 'ถ่ายภาพเมนูฤดูหนาว 12 เมนู และตัดคลิปสั้น 3 คลิปสำหรับ Instagram Reels', skills: ['Photography', 'Video', 'CapCut'],
    province: 'เชียงใหม่', salary_min: 4500, salary_max: 6000, pay_unit: 'project', gig_days: 3
  });
  const reactJob = await job(startupOwner, startup.id, {
    title: 'Frontend Developer (React) ฝึกงาน', job_type: 'internship', department_id: startupRoot.id, work_mode: 'hybrid',
    description: 'พัฒนาหน้าจอแอปออมดีบนเว็บ ทำงานกับ Designer และ Backend', requirements: 'ต้องมี: React หรือ JavaScript พื้นฐาน\nมีแล้วดี: TypeScript, Git',
    skills: ['React', 'JavaScript', 'TypeScript', 'Git'], province: 'กรุงเทพมหานคร', salary_min: 12000, salary_max: 15000
  }, CH.react);

  // คุณสมบัติสำหรับคัดกรองของประกาศ Content (ตัวอย่างผลจากปุ่ม "ให้ AI คิดโจทย์")
  await soft('คุณสมบัติประกาศ Content', () =>
    rpc(owner, 'save_job_ai_profile', {
      p_job: contentJob.id,
      p_objective: 'อยากได้คนดูแลเพจและ LINE OA ของแบรนด์ ยิงแอดเป็น เขียนโพสต์ขายของได้ ดูตัวเลขแล้วปรับแผนได้ ถ้าตัดคลิปสั้นได้ด้วยจะดีมาก',
      p_quals: [
        { name: 'ยิงโฆษณาออนไลน์ (Meta Ads)', description: 'ตั้งแคมเปญ เลือกกลุ่มเป้าหมาย คุมงบ', must_have: true, weight: 30 },
        { name: 'เขียนคอนเทนต์โซเชียล', description: 'โพสต์และแคปชันที่ขายของได้', must_have: true, weight: 30 },
        { name: 'อ่านผลและปรับงบ', description: 'อ่าน CTR CPC ยอดขาย แล้วปรับแผน', must_have: true, weight: 20 },
        { name: 'ถ่ายและตัดต่อวิดีโอสั้น', description: 'TikTok / Reels', must_have: false, weight: 10 },
        { name: 'ออกแบบกราฟิก', description: 'Canva หรือ Figma', must_have: false, weight: 10 }
      ]
    })
  );

  // ---------------------------------------------------------------- ผู้หางานเพิ่ม 10 คน
  console.log('• ผู้หางานเพิ่ม 10 คน');
  const P = {};
  P.c8 = await candidate('c8', 'ปณิตา รุ่งเรือง', {
    headline: 'ยิงแอด Meta Ads ให้ร้านค้าออนไลน์ 1 ปี ดูตัวเลขเป็น',
    intro: 'ดูแลโฆษณา Facebook และ Instagram ให้ร้านเสื้อผ้า 3 ร้าน งบรวมเดือนละ 60,000 บาท ลด CPC ได้ 35% ใน 2 เดือนด้วยการทดสอบภาพและกลุ่มเป้าหมาย',
    skills: ['Meta Ads', 'Content Writing', 'Data Analysis'], tools: ['Meta Business Suite', 'Canva', 'Google Sheets'],
    languages: [{ name: 'อังกฤษ', detail: 'TOEIC 820' }],
    experiences: [{ title: 'ฟรีแลนซ์ยิงแอด', detail: 'ร้านเสื้อผ้าออนไลน์ 3 ร้าน · 12 เดือน · งบรวม 60,000 บาท/เดือน' }],
    projects: [{ title: 'แคมเปญปลายปีร้าน "ผ้าดี"', detail: 'ROAS 4.2 · ยอดขายเพิ่ม 2.3 เท่าจากเดือนก่อน' }], expected_salary: 22000
  }, { institution_name: 'มหาวิทยาลัยธรรมศาสตร์', faculty: 'พาณิชยศาสตร์และการบัญชี', major: 'การตลาด', year_label: '2568', gpa: 3.51 });
  P.c9 = await candidate('c9', 'กฤษดา มีสุข', {
    headline: 'กราฟิกดีไซเนอร์จบใหม่ ชอบออกแบบแพ็กเกจอาหาร', intro: 'ออกแบบฉลากและโพสต์ให้ร้านขนมของครอบครัว ใช้ Figma และ Illustrator ถ่ายภาพสินค้าเองได้',
    skills: ['Graphic Design', 'Packaging Design', 'Photography'], tools: ['Figma', 'Illustrator', 'Photoshop', 'Canva'],
    projects: [{ title: 'ฉลากขนมเปี๊ยะ "บ้านแม่"', detail: 'ออกแบบใหม่ทั้งชุด ยอดขายหน้าร้านเพิ่ม 20%' }]
  }, { institution_name: 'มหาวิทยาลัยศิลปากร', faculty: 'มัณฑนศิลป์', major: 'ออกแบบนิเทศศิลป์', year_label: '2568', gpa: 3.28 });
  P.c10 = await candidate('c10', 'อรอุมา แสงทอง', {
    headline: 'ครีเอเตอร์ TikTok สายอาหาร 25,000 ผู้ติดตาม', intro: 'ทำคลิปสั้นรีวิวร้านอาหารเชียงใหม่ ตัดต่อด้วย CapCut คลิปที่ดีที่สุดยอดวิว 480,000',
    skills: ['TikTok', 'Video Editing', 'Content Writing'], tools: ['CapCut', 'Canva'], province: 'เชียงใหม่'
  }, { institution_name: 'มหาวิทยาลัยเชียงใหม่', faculty: 'การสื่อสารมวลชน', major: 'สื่อดิจิทัล', status: 'studying', year_label: 'ปี 4' });
  P.c11 = await candidate('c11', 'ชยพล วงศ์ใหญ่', {
    headline: 'จบสถิติ ทำ Dashboard ยอดขายด้วย Power BI', intro: 'ฝึกงานฝ่ายวางแผนการขาย 4 เดือน ทำ Dashboard ยอดขายรายสาขาให้ผู้จัดการใช้ทุกเช้า',
    skills: ['Data Analysis', 'Excel', 'SQL'], tools: ['Excel', 'Power BI', 'SQL', 'Python'],
    experiences: [{ title: 'ฝึกงานฝ่ายวางแผนการขาย', detail: 'บริษัทค้าปลีก · 4 เดือน · ทำ Dashboard Power BI 3 ชุด' }]
  }, { institution_name: 'จุฬาลงกรณ์มหาวิทยาลัย', faculty: 'พาณิชยศาสตร์และการบัญชี', major: 'สถิติ', year_label: '2568', gpa: 3.62 });
  P.c12 = await candidate('c12', 'สุพิชญา ทองคำ', {
    headline: 'Copywriter สองภาษา เขียนบทความ SEO', intro: 'เขียนบทความ SEO ภาษาไทยและอังกฤษให้เว็บท่องเที่ยว 40 บทความ ติดหน้าแรก Google 9 บทความ',
    skills: ['Copywriting', 'SEO', 'Content Writing'], tools: ['WordPress', 'Google Analytics', 'Canva'],
    languages: [{ name: 'อังกฤษ', detail: 'IELTS 7.0' }]
  }, { institution_name: 'มหาวิทยาลัยมหิดล', faculty: 'ศิลปศาสตร์', major: 'ภาษาอังกฤษ', year_label: '2568', gpa: 3.45 });
  P.c13 = await candidate('c13', 'ธีรวัฒน์ บุญมา', {
    headline: 'แอดมินร้านออนไลน์ ตอบแชตลูกค้า 1 ปี', intro: 'ดูแลแชต LINE OA และ Shopee ของร้านเครื่องสำอาง วันละ 150 แชต ได้คะแนนร้านค้า 4.9',
    skills: ['Customer Service', 'LINE OA', 'Shopee'], tools: ['LINE OA', 'Google Sheets']
  });
  P.c14 = await candidate('c14', 'เบญจมาศ ศรีวิไล', {
    headline: 'ประสานงานอีเวนต์และโครงการ', intro: 'ประธานฝ่ายจัดงานรับน้องคณะ ดูแลงบ 200,000 บาทและทีม 40 คน ฝึกงานบริษัทออร์แกไนซ์ 3 เดือน',
    skills: ['Event Planning', 'Project Coordination'], tools: ['Notion', 'Google Sheets', 'Canva']
  }, { institution_name: 'มหาวิทยาลัยเกษตรศาสตร์', faculty: 'มนุษยศาสตร์', major: 'การจัดการธุรกิจท่องเที่ยว', year_label: '2568', gpa: 3.18 });
  P.c15 = await candidate('c15', 'ณภัทร สายสุวรรณ', {
    headline: 'นักการตลาดออนไลน์สายอาหาร ทั้งยิงแอดและเขียนคอนเทนต์', intro: 'ฝึกงานบริษัทอาหารแช่แข็ง 6 เดือน ดูแลเพจ 120,000 ผู้ติดตาม ยิงแอดและเขียนแคปชันเอง',
    skills: ['Facebook Ads', 'Content Writing', 'Video Editing'], tools: ['Meta Business Suite', 'CapCut', 'Canva'],
    experiences: [{ title: 'ฝึกงานการตลาดออนไลน์', detail: 'บริษัทอาหารแช่แข็ง · 6 เดือน · ดูแลเพจ 120,000 ผู้ติดตาม' }]
  }, { institution_name: 'มหาวิทยาลัยขอนแก่น', faculty: 'บริหารธุรกิจและการบัญชี', major: 'การตลาด', year_label: '2568', gpa: 3.36 });
  P.c16 = await candidate('c16', 'พรรษา จันทร์เพ็ญ', {
    headline: 'บัญชีจบใหม่ ใช้ Express เป็น', intro: 'ฝึกงานสำนักงานบัญชี 4 เดือน บันทึกบัญชีลูกค้า 12 ราย ทำภาษีซื้อภาษีขาย',
    skills: ['Accounting', 'Tax'], tools: ['Express (บัญชี)', 'Excel']
  }, { institution_name: 'มหาวิทยาลัยรามคำแหง', faculty: 'บริหารธุรกิจ', major: 'การบัญชี', year_label: '2568', gpa: 3.05 });
  P.c17 = await candidate('c17', 'จิรายุ พงษ์ไพร', {
    headline: 'นักศึกษาวิศวคอมฯ ทำเว็บด้วย React และ TypeScript', intro: 'ทำเว็บจองคิวร้านตัดผมให้ร้านแถวบ้าน มีผู้ใช้จริง 300 คน โค้ดอยู่บน GitHub',
    skills: ['Web Development', 'React', 'TypeScript'], tools: ['React', 'TypeScript', 'Git', 'Figma'],
    projects: [{ title: 'เว็บจองคิวร้านตัดผม', detail: 'Next.js + Supabase · ผู้ใช้ 300 คน' }]
  }, { institution_name: 'มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าธนบุรี', faculty: 'วิศวกรรมศาสตร์', major: 'วิศวกรรมคอมพิวเตอร์', status: 'studying', year_label: 'ปี 4' });

  // ---------------------------------------------------------------- ข้อความแนะนำตัวของผู้สมัครเดิมให้ต่างกัน
  console.log('• ปรับข้อความแนะนำตัวของผู้สมัครชุดเดิม');
  const intros = {
    [c1.id]: 'ทำเพจรีวิวอาหารของตัวเอง 2 ปี เขียนคอนเทนต์และยิงแอด Facebook งบเล็ก ๆ เองทุกเดือน ดูยอดเข้าถึงและ CTR แล้วปรับโพสต์ตลอด ใช้ Canva และ CapCut ทุกวันค่ะ',
    [c2.id]: 'ถนัดเขียนสคริปต์และตัดต่อคลิป TikTok เคยทำคลิปให้ร้านกาแฟยอดวิว 120,000 อยากลองทำคอนเทนต์สินค้าอาหารครับ',
    [c3.id]: 'ฝึกงานฝ่ายขายออนไลน์ 3 เดือน ช่วยตอบแชต LINE OA และสรุปยอดขายใน Excel ทุกสัปดาห์ เคยช่วยยิงแอดบูสต์โพสต์ค่ะ',
    [c4.id]: 'รับงานถ่ายภาพอาหารฟรีแลนซ์ ถ่ายและตัดต่อวิดีโอด้วย Premiere ยังไม่เคยเขียนคอนเทนต์หรือยิงโฆษณาครับ'
  };
  for (const [uid, text] of Object.entries(intros)) await soft('แก้ข้อความแนะนำตัว', () => patch(`applications?job_id=eq.${contentJob.id}&candidate_id=eq.${uid}`, { intro_message: text }));

  // ---------------------------------------------------------------- ใบสมัคร
  console.log('• ใบสมัครและรอบโจทย์');
  const a = {};
  a.c8 = await apply(P.c8, contentJob.id, 'สวัสดีค่ะ ปณิตาค่ะ ยิงแอด Meta Ads ให้ร้านค้าออนไลน์มา 1 ปี คุมงบเดือนละ 60,000 บาท ดู CTR CPC แล้วปรับงบทุกวัน และเขียนแคปชันขายของเองค่ะ', 22000);
  a.c15 = await apply(P.c15, contentJob.id, 'ฝึกงานดูแลเพจอาหารแช่แข็ง 120,000 ผู้ติดตาม ยิงแอด Facebook เขียนคอนเทนต์ และตัดคลิปสั้นลง Reels เองครับ อยากทำงานกับแบรนด์อาหารไทย', 21000);
  a.c10 = await apply(P.c10, contentJob.id, 'ทำคลิป TikTok สายอาหาร 25,000 ผู้ติดตาม เขียนสคริปต์และตัดต่อเอง ยังไม่เคยยิงแอดแต่อยากเรียนรู้ค่ะ', 18000);
  a.c12 = await apply(P.c12, contentJob.id, 'เขียนบทความ SEO และ copywriting สองภาษา ใช้ Google Analytics ดูผล ยังไม่เคยทำโฆษณาโซเชียลโดยตรงค่ะ', 23000);
  a.c13 = await apply(P.c13, contentJob.id, 'เป็นแอดมินร้านออนไลน์ ตอบแชตลูกค้าวันละ 150 แชตครับ', 17000);
  a.c14 = await apply(P.c14, contentJob.id, 'ชอบงานประสานงานและจัดอีเวนต์ อยากลองงานการตลาดค่ะ', 19000);

  a.c9g = await apply(P.c9, graphicJob, 'ออกแบบฉลากและโพสต์ให้ร้านขนม ใช้ Figma Illustrator และ Canva ถ่ายภาพสินค้าเองได้ครับ', 22000);
  a.c1g = await apply(c1, graphicJob, 'ทำภาพโพสต์เพจรีวิวอาหารเองด้วย Canva ทุกสัปดาห์ อยากพัฒนางานออกแบบให้เป็นระบบค่ะ', 20000);
  a.c10g = await apply(P.c10, graphicJob, 'ออกแบบปกคลิปและภาพโปรโมตช่อง TikTok ด้วย Canva ค่ะ', 20000);

  a.c11d = await apply(P.c11, dataJob, 'ทำ Dashboard ยอดขายด้วย Power BI และ SQL ระหว่างฝึกงาน ใช้ Excel Pivot และ XLOOKUP คล่องครับ', 25000);
  a.c1d = await apply(c1, dataJob, 'สรุปยอดเข้าถึงและยอดขายจากเพจลง Google Sheets ทุกเดือน อยากฝึกวิเคราะห์ข้อมูลให้ลึกขึ้นค่ะ', 22000);
  a.c16d = await apply(P.c16, dataJob, 'ใช้ Excel ทำงานบัญชีทุกวัน ทำ Pivot ได้ค่ะ', 20000);

  a.c13s = await apply(P.c13, serviceJob, 'ดูแลแชต LINE OA และ Shopee วันละ 150 แชต คะแนนร้าน 4.9 รับมือลูกค้าร้องเรียนได้ครับ', 17000);
  a.c1s = await apply(c1, serviceJob, 'ตอบคอมเมนต์และแชตของเพจเองทุกวัน ใจเย็นกับลูกค้าค่ะ', 18000);
  a.c3s = await apply(c3, serviceJob, 'ช่วยตอบแชต LINE OA ระหว่างฝึกงานขายออนไลน์ 3 เดือนค่ะ', 17000);

  a.c17r = await apply(P.c17, reactJob, 'ทำเว็บจองคิวด้วย Next.js React TypeScript และ Supabase มีผู้ใช้จริง 300 คน โค้ดอยู่บน GitHub ครับ', 14000);
  a.c11r = await apply(P.c11, reactJob, 'เขียน Python และ SQL ได้ เริ่มเรียน JavaScript ครับ', 13000);

  a.c10gig = await apply(P.c10, gigJob, 'อยู่เชียงใหม่ ถ่ายภาพอาหารและตัดคลิป Reels ด้วย CapCut ได้ค่ะ ว่างสัปดาห์หน้า', 5000);
  a.c9gig = await apply(P.c9, gigJob, 'ถ่ายภาพสินค้าและจัดแสงได้ เดินทางไปเชียงใหม่ได้ครับ', 6000);
  if (salesJob) await apply(P.c13, salesJob.id, 'ว่างเสาร์–อาทิตย์ ตอบแชตลูกค้าเร็วและสุภาพครับ');

  // ---------------------------------------------------------------- รอบโจทย์และคะแนน
  // Content: ปณิตาได้คะแนนสูง · ณภัทรส่งแล้วรอคะแนน (ลองปุ่มร่างคะแนนสด) · อรอุมาได้รับเชิญ
  const cc = contentCh.criteria;
  await runChallenge(owner, P.c8, a.c8, {
    answer: 'จันทร์: ทีเซอร์ภาพขวดปิดฉลาก + คำถาม "เย็นนี้กินอะไร" (แอดงบ 500 บาท ทดสอบ 2 ภาพ)\nพุธ: คลิป 30 วินาที 3 เมนูใน 10 นาที (แอด 1,500 บาท เลือกภาพที่ CTR สูงกว่า)\nศุกร์: เปิดตัว + โค้ดส่วนลดผ่าน LINE OA (แอด 3,000 บาท)\n\nแคปชัน: เหนื่อยมาทั้งวัน เย็นนี้ไม่ต้องคิดนาน น้ำจิ้มสูตรใหม่ ราดปุ๊บอร่อยปั๊บ ทัก LINE รับสูตร 3 เมนูฟรี\n\nวัดผล: CTR > 1.5%, ต้นทุนต่อการทักแชต < 25 บาท, ยอดใช้โค้ดใน LINE OA',
    reasoning: 'แบ่งงบตามผลทดสอบวันแรก เพราะงบน้อยต้องเทไปที่ภาพที่ได้ผล และวัดยอดขายจริงผ่านโค้ด', ai_use: 'ideas', ai_detail: 'ใช้ช่วยคิดชื่อเมนู'
  }, { scores: scoresOf(cc, [0.95, 0.9, 0.96]), feedback: 'แบ่งงบตามผลทดสอบได้ดีมาก และตัวเลขวัดผลชัดเจน ลองเพิ่มคอนเทนต์ที่ไม่ขายตรงสัก 1 ชิ้น' });
  await runChallenge(owner, P.c15, a.c15, {
    answer: 'แผน 3 โพสต์: 1) คลิป Reels ทำเมนูเย็นใน 10 นาที 2) โพสต์รีวิวจากลูกค้าจริง 3) โปรเปิดตัวแถมสูตรอาหาร\nแคปชัน: กลับบ้านดึกก็ทำกับข้าวทัน น้ำจิ้มสูตรใหม่ช่วยให้มื้อเย็นง่ายขึ้น\nวัดผล: ยอดดูคลิป ยอดแชร์ และคนทักแชต',
    reasoning: 'คนทำงานดูคลิปสั้นช่วงเดินทางกลับบ้าน จึงเน้น Reels', ai_use: 'none'
  }, null);
  await runChallenge(owner, P.c10, a.c10, null, null);
  // ไม่ผ่านพร้อมเหตุผลมาตรฐาน
  for (const id of [a.c13, a.c14]) {
    if ((await stageOf(id)) === 'applied') await soft('ปฏิเสธ', () => rpc(owner, 'reject_applications', { p_apps: [id], p_reasons: ['missing_core_skill'], p_note: null, p_message: null }));
  }

  // แฟ้มผลงานของพิมพ์ชนก: คะแนนดีขึ้นตามเวลา 72 → 80 → 84 → 88 (คะแนน 88 มีอยู่แล้วจากชุดแรก)
  await runChallenge(logiOwner, c1, a.c1d, {
    answer: 'สรุป: สินค้าผ้าพันคอขายดีที่สุด 38% ของยอด ช่องทาง Shopee 52% LINE 30% เว็บ 18%\nข้อเสนอ: 1) เพิ่มสต็อกผ้าพันคอก่อนหน้าหนาว 2) ทำโปร LINE ลูกค้าเก่า 3) ลดงบเว็บไซต์',
    reasoning: 'ใช้ Pivot แยกตามสินค้าและช่องทาง แล้วดูเดือนที่โตเร็วที่สุด', ai_use: 'none'
  }, { scores: scoresOf(CH.data.criteria, [0.7, 0.75, 0.73]), feedback: 'ตัวเลขถูกต้อง ข้อเสนอเริ่มดี ควรใส่กราฟเปรียบเทียบรายเดือน', daysAgo: 16 });
  await runChallenge(owner, c1, a.c1g, {
    answer: 'ใช้สีเขียวอ่อนกับครีมตามแบรนด์ชา ข้อความ "1 แถม 1" ใหญ่กลางภาพ วันที่โปรอยู่ล่างขวา สตอรี่วางสินค้าแนวตั้งและปุ่ม "ทักเลย" ด้านล่าง\nลิงก์ไฟล์: (แนบใน Canva)',
    reasoning: 'คนดูบนมือถือต้องเห็นคำว่า 1 แถม 1 ก่อนอย่างอื่น', ai_use: 'partial', ai_detail: 'ใช้ AI ลบพื้นหลังภาพแก้ว'
  }, { scores: scoresOf(CH.graphic.criteria, [0.85, 0.77, 0.76]), feedback: 'อ่านง่ายบนมือถือดีมาก ลองลดจำนวนสีลงเพื่อให้ดูเป็นแบรนด์เดียวกัน', daysAgo: 11 });
  await runChallenge(owner, c1, a.c1s, {
    answer: 'แชต: ขอโทษมากค่ะที่ขวดแตก ส่งรูปให้ร้านได้เลย ร้านจะส่งขวดใหม่ให้ภายในพรุ่งนี้พร้อมคูปอง 50 บาท\nรีวิว: ขอบคุณที่บอกเราค่ะ ทักแชตร้านแล้วนะคะ ส่งของใหม่ให้แล้ว และเปลี่ยนวิธีแพ็กให้แน่นขึ้น\nป้องกัน: ห่อบับเบิล 2 ชั้น ใส่กล่องแยกช่อง ทดสอบโยนกล่องก่อนส่ง',
    reasoning: 'ลูกค้าต้องการรู้ว่าจะได้ของใหม่เมื่อไร จึงบอกวันชัด', ai_use: 'none'
  }, { scores: scoresOf(CH.service.criteria, [0.86, 0.86, 0.8]), feedback: 'น้ำเสียงจริงใจและบอกวันชัด ขั้นตอนป้องกันทำได้จริง', daysAgo: 6 });
  await soft('ย้อนวันคะแนนชุดแรก', async () => {
    const [first] = await sel(`applications?job_id=eq.${contentJob.id}&candidate_id=eq.${c1.id}&select=id`);
    if (first) await patch(`challenge_scores?application_id=eq.${first.id}`, { graded_at: daysAgo(2) });
  });

  // ตำแหน่งอื่น
  await runChallenge(owner, P.c9, a.c9g, {
    answer: 'โปสเตอร์โทนน้ำตาลอบอุ่น แก้วชา 2 ใบชนกันกลางภาพ ตัวอักษร "ซื้อ 1 แถม 1" หนาสีขาวบนพื้นเข้ม สตอรี่ใช้ภาพเดียวกันครอปแนวตั้ง',
    reasoning: 'ภาพแก้วชนกันสื่อเรื่องแบ่งกับเพื่อนโดยไม่ต้องอ่าน', ai_use: 'none'
  }, { scores: scoresOf(CH.graphic.criteria, [0.9, 0.94, 0.88]), feedback: 'แนวคิดภาพชัดและสวย ตรงแบรนด์มาก' });
  await runChallenge(owner, P.c10, a.c10g, null, null);
  await runChallenge(logiOwner, P.c11, a.c11d, {
    answer: 'ทำ Pivot ตามเดือน สินค้า ช่องทาง และกราฟเส้นยอดรายสัปดาห์ พบว่ายอด Shopee โต 18% ต่อเดือน สินค้าผ้าพันคอมีกำไรต่อชิ้นสูงสุด\nข้อเสนอ: 1) ย้ายงบโฆษณาเว็บไปที่ Shopee 2) ทำชุดของขวัญผ้าพันคอ 3) ติดตามอัตราคืนสินค้ารายสัปดาห์',
    reasoning: 'ดูทั้งยอดขายและกำไรต่อชิ้น เพราะยอดขายสูงอาจกำไรน้อย', ai_use: 'none'
  }, { scores: scoresOf(CH.data.criteria, [0.95, 0.93, 0.9]), feedback: 'วิเคราะห์ครบทั้งยอดและกำไร กราฟอ่านง่ายมาก' });
  await runChallenge(owner, P.c13, a.c13s, {
    answer: 'แชต: ขอโทษจริง ๆ ครับ รบกวนส่งรูปขวด ร้านส่งของใหม่ให้วันนี้ ถึงภายใน 2 วัน\nรีวิว: ขออภัยครับ ทีมติดต่อไปแล้วและส่งของใหม่ให้\nป้องกัน: เปลี่ยนกล่องหนาขึ้น ติดสติกเกอร์ระวังแตก',
    reasoning: 'ตอบเร็วและบอกเวลาชัด', ai_use: 'none'
  }, null);
  await runChallenge(startupOwner, P.c17, a.c17r, {
    answer: 'ลิงก์ GitHub และเดโมแนบแล้ว ทำค้นหาแบบพิมพ์แล้วกรองทันที กรองตามระยะเวลา 3/6/12 เดือน ใช้ React + TypeScript แยกคอมโพเนนต์ ProductList, Filter, SearchBox และเขียน README วิธีรัน',
    reasoning: 'เลือกกรองฝั่งหน้าเว็บเพราะข้อมูลมีแค่ 20 รายการ', ai_use: 'partial', ai_detail: 'ใช้ AI ช่วยเขียน test บางส่วน'
  }, { scores: scoresOf(CH.react.criteria, [0.92, 0.86, 0.8]), feedback: 'โค้ดแบ่งส่วนดี README ครบ ลองเพิ่มการจัดการกรณีไม่พบผลลัพธ์' });
  if ((await stageOf(a.c11r)) === 'applied') await soft('ปฏิเสธ', () => rpc(startupOwner, 'reject_applications', { p_apps: [a.c11r], p_reasons: ['missing_core_skill'], p_note: null, p_message: null }));
  await releaseBatches();

  // ---------------------------------------------------------------- หลักฐานที่ยืนยันแล้ว
  console.log('• วุฒิที่ตรวจแล้ว และใบรับรองภาษา 3 ระดับ');
  for (const u of [c1, P.c8, P.c11, P.c12]) {
    await soft('ยืนยันวุฒิ', () => patch(`educations?user_id=eq.${u.id}&verify_level=eq.none`, { verify_level: 'doc', verified_at: new Date().toISOString(), verify_note: 'ข้อมูลเดโม' }));
  }
  const certs = [
    { user_id: c1.id, exam: 'TOEIC', score_text: '785', exam_date: '2026-03-14', expires_on: '2028-03-14', trust: 'official', verify_url: 'https://www.etsglobal.org/th/en/digital-score-report', holder_name: 'PIMCHANOK JAIDEE', checks: { name_match: true, not_expired: true, has_number: true, not_edited: true } },
    { user_id: P.c8.id, exam: 'TOEIC', score_text: '820', exam_date: '2025-11-02', expires_on: '2027-11-02', trust: 'doc', holder_name: 'PANITA RUNGRUEANG', checks: { name_match: true, not_expired: true, has_number: true, not_edited: true } },
    { user_id: P.c12.id, exam: 'IELTS', score_text: '7.0', sub_scores: { Listening: '7.5', Reading: '7.0', Writing: '6.5', Speaking: '7.0' }, exam_date: '2026-01-20', expires_on: '2028-01-20', trust: 'official', verify_url: 'https://ielts.org/organisations/results-verification', holder_name: 'SUPITCHAYA THONGKHAM', checks: { name_match: true, not_expired: true, has_number: true, not_edited: true } },
    { user_id: P.c17.id, exam: 'IELTS', score_text: '6.5', sub_scores: { Listening: '7.0', Reading: '6.5', Writing: '6.0', Speaking: '6.5' }, cert_number: '25TH008417PONG001A', exam_date: '2026-06-08', expires_on: '2028-06-08', trust: 'doc_pending', holder_name: 'JIRAYU PONGPRAI', checks: { name_match: true, not_expired: true, has_number: true, not_edited: true } },
    { user_id: P.c10.id, exam: 'TOEIC', score_text: '650', trust: 'self', checks: {} }
  ];
  for (const c of certs) {
    const [have] = await sel(`language_certificates?user_id=eq.${c.user_id}&exam=eq.${c.exam}&select=id`);
    if (!have) await soft('ใบรับรองภาษา', () => insert('language_certificates', { sub_scores: {}, cert_number: c.cert_number || `DEMO-${c.exam}-${c.score_text}`, ...c, ...(c.trust === 'doc' || c.trust === 'official' ? { reviewed_at: new Date().toISOString() } : {}) }));
  }

  console.log('\n✓ เพิ่มข้อมูลเดโมชุดที่ 2 แล้ว (ทุกบัญชีใช้รหัสผ่าน DEMO_PASSWORD)');
  console.log(`  บริษัทใหม่: ${email('startup')} (ออมดี เทคโนโลยี)`);
  console.log('  ประกาศ Content มีผู้สมัคร 10 คน: ลองพิมพ์คีย์เวิร์ด "ยิงแอด, เขียนคอนเทนต์, Canva, TOEIC" ในกระดานผู้สมัคร');
  console.log('  ณภัทร (Content) และ ธีรวัฒน์ (ดูแลลูกค้า) ส่งโจทย์แล้ว รอให้คะแนน: ลองปุ่ม "ร่างคะแนน"');
  console.log(`  ${email('candidate')}: แฟ้มผลงาน 4 งาน คะแนน 72 → 80 → 84 → 88 · TOEIC ยืนยันกับผู้จัดสอบ`);
  console.log('  /admin: ใบรับรอง IELTS ของจิรายุรอตรวจ');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
