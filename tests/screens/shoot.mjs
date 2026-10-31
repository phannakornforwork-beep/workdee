// ถ่ายภาพหน้าจอทุกหน้าหลักที่ขนาด iPad (แนวตั้งและแนวนอน) และมือถือ ด้วยข้อมูลจาก scripts/seed-demo.mjs
// Logs in through the real /login form, then captures each page. Output: screens/<size>/<name>.png
// Needs: a running site (WEB_URL), the demo seed already applied, DEMO_PASSWORD, and `playwright` installed.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const WEB = (process.env.WEB_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_PASSWORD;
const OUT = process.env.SCREENS_DIR || 'screens';
const DOMAIN = process.env.DEMO_EMAIL_DOMAIN || 'example.com';

const sizes = {
  'ipad-portrait': { ...devices['iPad (gen 7)'], viewport: { width: 820, height: 1180 } },
  'ipad-landscape': { ...devices['iPad (gen 7) landscape'], viewport: { width: 1180, height: 820 } },
  phone: devices['iPhone 13']
};

async function login(page, who) {
  try {
    await loginOnce(page, who);
    return true;
  } catch (e) {
    problems.push(`login ${who}: ${String(e.message || e).split('\n')[0]} (url ${page.url()})`);
    await page.screenshot({ path: path.join(OUT, `login-failed-${who}.png`), fullPage: true }).catch(() => {});
    return false;
  }
}

async function loginOnce(page, who) {
  await page.goto(`${WEB}/login`);
  await page.fill('#email', `demo.${who}@${DOMAIN}`);
  await page.fill('#password', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }), page.click('form button[type=submit]:has-text("เข้าสู่ระบบ")')]);
}

async function firstHref(page, selector) {
  const href = await page.locator(selector).first().getAttribute('href').catch(() => null);
  return href;
}

const problems = [];

async function shoot(page, dir, name, url) {
  try {
    await shootOnce(page, dir, name, url);
  } catch (e) {
    problems.push(`${dir}/${name} (${url}): ${String(e.message || e).split('\n')[0]}`);
  }
}

async function shootOnce(page, dir, name, url) {
  const res = await page.goto(`${WEB}${url}`, { waitUntil: 'networkidle', timeout: 30000 });
  const status = res?.status() ?? 0;
  // หน้าล้นจอแนวนอน = ใช้บน iPad แล้วต้องเลื่อนซ้ายขวา
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (status >= 400) problems.push(`${dir}/${name}: HTTP ${status}`);
  if (overflow > 2) problems.push(`${dir}/${name}: กว้างเกินจอ ${overflow}px`);
  await page.screenshot({ path: path.join(OUT, dir, `${name}.png`), fullPage: true });
}

const browser = await chromium.launch();
for (const [dir, device] of Object.entries(sizes)) {
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });

  const guest = await browser.newContext({ ...device, locale: 'th-TH' });
  const gp = await guest.newPage();
  await shoot(gp, dir, '01-home', '/');
  await shoot(gp, dir, '02-jobs', '/jobs');
  await gp.goto(`${WEB}/jobs`);
  const jobHref = await firstHref(gp, 'a[href^="/jobs/"]');
  if (jobHref) await shoot(gp, dir, '03-job-detail', jobHref);
  await shoot(gp, dir, '04-login', '/login');
  await shoot(gp, dir, '05-signup', '/signup');
  await guest.close();

  const cand = await browser.newContext({ ...device, locale: 'th-TH' });
  const cp = await cand.newPage();
  if (await login(cp, 'candidate')) {
  await shoot(cp, dir, '10-spaces', '/spaces');
  await shoot(cp, dir, '11-me', '/me');
  await shoot(cp, dir, '12-profile', '/me/profile');
  await shoot(cp, dir, '13-applications', '/me/applications');
  await cp.goto(`${WEB}/me/applications`);
  const appHref = await firstHref(cp, 'a[href^="/me/applications/"]');
  if (appHref) await shoot(cp, dir, '14-application-detail', appHref);
  await shoot(cp, dir, '15-plan', '/me/plan');
  await shoot(cp, dir, '16-notifications', '/me/notifications');
  }
  await cand.close();

  const comp = await browser.newContext({ ...device, locale: 'th-TH' });
  const op = await comp.newPage();
  const okLogin = await login(op, 'company');
  if (okLogin) await op.goto(`${WEB}/spaces`);
  const companyHref = await firstHref(op, 'a[href^="/c/"]');
  const base = okLogin && companyHref ? companyHref.match(/^\/c\/[^/]+/)[0] : null;
  if (!base) problems.push(`${dir}: ไม่พบพื้นที่บริษัทในหน้า /spaces`);
  else {
    await shoot(op, dir, '20-company-home', base);
    await shoot(op, dir, '21-company-jobs', `${base}/jobs`);
    await shoot(op, dir, '22-pipeline', `${base}/pipeline`);
    await op.goto(`${WEB}${base}/pipeline`);
    const aHref = await firstHref(op, `a[href^="${base}/applications/"]`);
    if (aHref) await shoot(op, dir, '23-application', aHref);
    await shoot(op, dir, '24-interviews', `${base}/interviews`);
    await shoot(op, dir, '24b-talent', `${base}/talent`);
    await shoot(op, dir, '25-team', `${base}/team`);
    await shoot(op, dir, '26-work', `${base}/work`);
    await shoot(op, dir, '27-chat', `${base}/chat`);
    await shoot(op, dir, '28-new-job', `${base}/jobs/new`);
    await shoot(op, dir, '29-notifications', `${base}/notifications`);
    await shoot(op, dir, '30-help', `${base}/help`);
  }
  await comp.close();
}
await browser.close();

fs.writeFileSync(path.join(OUT, 'problems.txt'), problems.length ? problems.join('\n') + '\n' : 'ไม่พบปัญหา\n');
console.log(problems.length ? `พบ ${problems.length} จุด:\n${problems.join('\n')}` : 'ทุกหน้าแสดงผลได้ และไม่กว้างเกินจอ');
