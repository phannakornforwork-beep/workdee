# ติดตั้ง WorkDee เป็นเว็บไซต์จริง

ใช้บริการที่เริ่มต้นได้ฟรี 3 อย่าง และอีก 2 อย่างที่ไม่บังคับ

| บริการ | ใช้ทำอะไร | บังคับ |
|---|---|---|
| GitHub | เก็บโค้ด และรันชุดทดสอบอัตโนมัติ | ใช่ |
| Supabase | ฐานข้อมูล ระบบล็อกอิน ไฟล์แนบ แชตเรียลไทม์ | ใช่ |
| Vercel | เปิดเว็บไซต์ และรันงานตามเวลา | ใช่ |
| Resend | ส่งอีเมล (ยืนยันอีเมล ลืมรหัสผ่าน แจ้งเตือน) | ต้องมีก่อนเปิดให้คนทั่วไปสมัคร |
| LINE Official Account | ส่งแจ้งเตือนเข้า LINE | ไม่บังคับ |

ใช้เวลาประมาณ 45–60 นาที ทำผ่านเว็บเบราว์เซอร์ได้ทั้งหมด

---

## 1. สร้างโปรเจกต์ Supabase

1. เข้า [supabase.com](https://supabase.com) → **New project**
2. ตั้งชื่อ `workdee` เลือก Region **Southeast Asia (Singapore)** ตั้งรหัสผ่านฐานข้อมูลแล้วจดเก็บไว้
3. รอสร้างเสร็จ แล้วเปิด **Project Settings → API Keys** จดค่าเหล่านี้
   - Project URL เช่น `https://abcd1234.supabase.co`
   - **Publishable key** (`sb_publishable_...`) หรือ anon key แบบเดิม
   - **Secret key** (`sb_secret_...`) หรือ service_role key แบบเดิม — เป็นความลับ ห้ามใส่ในโค้ดหรือส่งให้ใคร

## 2. สร้างตารางในฐานข้อมูล (เลือกวิธีเดียว)

**วิธี A: ทำในหน้าเว็บ Supabase**

1. เปิด **SQL Editor → New query**
2. ใน GitHub เปิดโฟลเดอร์ `supabase/migrations` แล้วทำทีละไฟล์ **ตามลำดับเลขจากน้อยไปมาก** (12 ไฟล์)
   เปิดไฟล์ → กด **Raw** → คัดลอกทั้งหมด → วางใน SQL Editor → **Run**
3. ทุกไฟล์ต้องขึ้น `Success. No rows returned` ถ้าไฟล์ไหนขึ้น error ให้หยุดและแก้ก่อนทำไฟล์ถัดไป

**วิธี B: ให้ GitHub ส่งขึ้นให้อัตโนมัติ**

1. ใน Supabase กด **Connect** (ด้านบน) → แท็บ **Session pooler** → คัดลอก URI
   แล้วแทน `[YOUR-PASSWORD]` ด้วยรหัสผ่านฐานข้อมูล (ถ้ารหัสมีอักขระพิเศษ เช่น `@ # %` ต้องแปลงเป็นรูปแบบ URL เช่น `@` เป็น `%40`)
2. ใน GitHub ของ repository → **Settings → Secrets and variables → Actions → New repository secret**
   ชื่อ `SUPABASE_DB_URL` ค่า = URI จากข้อ 1
3. แท็บ **Actions → Deploy database → Run workflow** รันแบบติ๊ก dry run ก่อนเพื่อดูรายการ แล้วรันอีกครั้งโดยเอาติ๊กออก

ใช้วิธีเดียวกับฐานข้อมูลเดียวกันตลอด (วิธี B จำว่าไฟล์ไหนรันแล้ว วิธี A ไม่ได้จำ) เมื่อมี migration ใหม่ในอนาคต วิธี B จะรันเฉพาะไฟล์ใหม่ให้

## 3. ตั้งค่าการล็อกอิน (Supabase → Authentication)

1. **URL Configuration**
   - Site URL: ที่อยู่เว็บจริง เช่น `https://workdee.vercel.app` (ถ้ายังไม่รู้ ใส่หลังขั้นที่ 4 แล้วกลับมาแก้)
   - Redirect URLs: เพิ่ม `https://workdee.vercel.app/**` และ `http://localhost:3000/**`
2. **Emails → Templates** แก้ลิงก์ในอีเมล 2 แบบ เพื่อให้กดจากแอปอีเมลบนมือถือแล้วใช้ได้
   - Confirm signup: เปลี่ยน `{{ .ConfirmationURL }}` เป็น
     `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`
   - Reset password: เปลี่ยนเป็น
     `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`
3. **Sign In / Providers → Email**: ตั้ง Minimum password length = 8
4. **Emails → SMTP Settings** (จำเป็นก่อนให้คนนอกสมัคร เพราะอีเมลในตัวของ Supabase ส่งได้เฉพาะสมาชิกทีมโปรเจกต์ และจำกัดจำนวนต่อชั่วโมง)
   1. สมัคร [resend.com](https://resend.com) → **Domains** → เพิ่มโดเมนของคุณแล้วทำตามขั้นตอนยืนยัน DNS
   2. **API Keys** → สร้างคีย์
   3. กลับมาที่ Supabase เปิด Custom SMTP แล้วใส่ Host `smtp.resend.com` Port `465` Username `resend` Password = API key
      Sender email เช่น `no-reply@โดเมนของคุณ` Sender name `WorkDee`

> **เดโมในชั้นเรียนโดยยังไม่มีโดเมน:** ปิด **Confirm email** ใน Sign In / Providers → Email ได้ชั่วคราว
> คนจะสมัครแล้วใช้งานได้ทันทีโดยไม่ต้องยืนยันอีเมล แต่ใครก็ใช้อีเมลคนอื่นสมัครได้ และใช้ลืมรหัสผ่านไม่ได้ เปิดกลับก่อนใช้จริง

## 4. เปิดเว็บไซต์บน Vercel

1. เข้า [vercel.com](https://vercel.com) ด้วยบัญชี GitHub → **Add New → Project** → Import repository `workdee`
2. ก่อนกด Deploy เปิด **Environment Variables** แล้วใส่

| ชื่อ | ค่า |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL จากขั้นที่ 1 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `SUPABASE_SECRET_KEY` | Secret key |
| `NEXT_PUBLIC_SITE_URL` | ที่อยู่เว็บ เช่น `https://workdee.vercel.app` (ไม่มี `/` ท้าย) |
| `CRON_SECRET` | ข้อความสุ่มยาว 32 ตัวขึ้นไป (เช่น สร้างจากเครื่องมือสร้างรหัสผ่าน) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | อีเมลติดต่อทีมงาน |
| `NEXT_PUBLIC_OPERATOR_NAME` | ชื่อผู้ให้บริการ (บุคคลหรือนิติบุคคล) แสดงในนโยบายความเป็นส่วนตัว |
| `NEXT_PUBLIC_OPERATOR_ADDRESS` | ที่อยู่ผู้ให้บริการ |
| `RESEND_API_KEY` | API key ของ Resend (สำหรับอีเมลแจ้งเตือน) |
| `EMAIL_FROM` | เช่น `WorkDee <no-reply@โดเมนของคุณ>` |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` / `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` | ถ้าใช้ LINE (ขั้นที่ 7) |

3. กด **Deploy** รอประมาณ 2–3 นาที
4. ถ้าที่อยู่เว็บที่ได้ต่างจากที่ใส่ไว้ แก้ `NEXT_PUBLIC_SITE_URL` และ Site URL ใน Supabase ให้ตรง แล้ว **Redeploy**
   (ค่าที่ขึ้นต้นด้วย `NEXT_PUBLIC_` ต้อง Redeploy ทุกครั้งที่แก้)

ไฟล์ `vercel.json` ตั้งงานประจำวันไว้แล้ว ทุกวันช่วง 09:00–10:00 น. เวลาไทย: ตรวจกฎ 7 วัน สร้างสรุปประจำวัน และส่งแจ้งเตือนที่ค้าง
(Vercel แผนฟรีรันงานตามเวลาได้วันละครั้ง และเวลาคลาดได้ภายในชั่วโมงนั้น ขั้นที่ 5 ทำให้ถี่และตรงเวลาขึ้น)

## 5. ให้ระบบส่งแจ้งเตือนทุก 5 นาที (แนะนำ)

แผนฟรีของ Vercel รันงานได้วันละครั้ง ใช้ Supabase เรียกเว็บแทนทุก 5 นาที เพื่อให้ LINE/อีเมลออกเร็ว และกฎ 7 วันตรงเวลา

1. Supabase → **Database → Extensions** เปิด `pg_cron` และ `pg_net`
2. SQL Editor รันคำสั่งนี้ (แก้ 2 บรรทัดแรกเป็นค่าของคุณ)

```sql
select vault.create_secret('https://workdee.vercel.app', 'workdee_site_url');
select vault.create_secret('ค่า CRON_SECRET เดียวกับใน Vercel', 'workdee_cron_secret');

select cron.schedule('workdee-dispatch', '*/5 * * * *', $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'workdee_site_url') || '/api/cron/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'workdee_cron_secret')),
    timeout_milliseconds := 30000
  );
$$);
```

ดูผลได้ที่ **Integrations → Cron** หรือคำสั่ง `select * from cron.job_run_details order by start_time desc limit 5;`
หยุดได้ด้วย `select cron.unschedule('workdee-dispatch');`

## 6. ตั้งตัวเองเป็นผู้ดูแลระบบ

1. สมัครสมาชิกในเว็บด้วยอีเมลของคุณ
2. SQL Editor รัน (แก้อีเมล)

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'you@example.com';
```

3. เปิด `https://เว็บของคุณ/admin` เพื่อตรวจหนังสือรับรองบริษัทและเอกสารวุฒิ
   บริษัทต้องผ่านการยืนยันก่อนจึงเผยแพร่ประกาศงานได้

## 7. เชื่อม LINE (ไม่บังคับ)

1. สร้าง LINE Official Account ที่ [LINE Official Account Manager](https://manager.line.biz)
2. ในบัญชี OA → **Settings → Messaging API → Enable Messaging API**
3. เปิด [LINE Developers Console](https://developers.line.biz/console/) เลือก channel ของ OA
   - แท็บ Basic settings: คัดลอก **Channel secret** → `LINE_CHANNEL_SECRET`
   - แท็บ Messaging API: กด Issue **Channel access token (long-lived)** → `LINE_CHANNEL_ACCESS_TOKEN`
   - Webhook URL: `https://เว็บของคุณ/api/line/webhook` → กด **Verify** → เปิด **Use webhook**
4. ใน OA Manager → **Response settings**: ปิดข้อความตอบกลับอัตโนมัติ (Auto-response) เปิด Webhooks
5. ลิงก์เพิ่มเพื่อน `https://line.me/R/ti/p/@ไอดีของOA` → `NEXT_PUBLIC_LINE_ADD_FRIEND_URL`
6. Redeploy ใน Vercel

วิธีใช้: ผู้ใช้เปิดหน้าการแจ้งเตือน → สร้างรหัสเชื่อม LINE → พิมพ์รหัส 6 หลักในแชตกับ OA
แพ็กเกจฟรีของ LINE OA มีโควตาข้อความต่อเดือนจำกัด (ดูตัวเลขล่าสุดในหน้าแพ็กเกจของ LINE OA) ถ้าเกินโควตา ระบบยังแจ้งในแอปและอีเมลตามปกติ

## 8. ทดสอบหลังเปิดเว็บ

ใช้ 2 บัญชี (เช่น เบราว์เซอร์ปกติกับหน้าต่างไม่ระบุตัวตน)

1. บัญชีที่ 1 สร้างพื้นที่บริษัท → แนบหนังสือรับรอง → บัญชีผู้ดูแล (ขั้นที่ 6) ยืนยันที่ `/admin`
2. บริษัทลงประกาศจากแม่แบบ พร้อมโจทย์
3. บัญชีที่ 2 กรอกโปรไฟล์ → สมัครงาน
4. บริษัทเชิญทำโจทย์ → ผู้สมัครส่งงาน → บริษัทให้คะแนน → เปิดเวลาว่าง → เชิญสัมภาษณ์ → ผู้สมัครเลือกเวลา
5. ลองตอบหลายคนพร้อมกันแล้วกดยกเลิกภายใน 30 วินาที
6. บริษัทสร้างลิงก์เชิญทีม → บัญชีที่ 2 เข้าร่วม → ตรวจว่าบริษัทไม่เห็นใบสมัครหรือแผนอาชีพของบัญชีที่ 2 จากพื้นที่บริษัท

## 9. ก่อนเปิดให้คนทั่วไปใช้

- [ ] ให้ผู้เชี่ยวชาญกฎหมายตรวจหน้า `/privacy` และ `/terms` และใส่ชื่อ ที่อยู่ อีเมลติดต่อของผู้ให้บริการครบ
- [ ] ตั้ง Custom SMTP และเปิด Confirm email
- [ ] จัดทำบันทึกรายการกิจกรรมการประมวลผลข้อมูล (ROPA) ตาม PDPA มาตรา 39 และแผนรับมือเหตุข้อมูลรั่ว (แจ้ง สคส. ภายใน 72 ชั่วโมง)
- [ ] อ่านและยอมรับข้อตกลงการประมวลผลข้อมูล (DPA) ของ Supabase และ Vercel
- [ ] ตั้งการสำรองข้อมูล: แผนฟรีของ Supabase ไม่มีการสำรองอัตโนมัติ (แผน Pro ขึ้นไปสำรองรายวัน) ถ้ายังใช้แผนฟรี ให้ export เองสม่ำเสมอด้วย `supabase db dump`
- [ ] ตั้งช่องทางแจ้งปัญหาและคำร้องขอใช้สิทธิ์ข้อมูล (ตอบภายใน 30 วัน)
- [ ] ถ้า Secret key หรือ `CRON_SECRET` หลุด ให้สร้างใหม่ใน Supabase/Vercel ทันที

## แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| กดลิงก์ในอีเมลแล้วขึ้น "ลิงก์หมดอายุ" | ยังไม่แก้ Email Templates ในขั้นที่ 3 หรือ Redirect URLs ไม่มีที่อยู่เว็บ |
| หน้าเว็บขึ้น "คุณไม่มีสิทธิ์" หรือ "function ... does not exist" | รัน migration ไม่ครบ 12 ไฟล์ หรือรันข้ามลำดับ |
| สมัครแล้วไม่มีอีเมลมา | ยังไม่ตั้ง Custom SMTP |
| อีเมลแจ้งเตือนไม่ออก แต่ในแอปมี | ไม่ได้ใส่ `RESEND_API_KEY`/`EMAIL_FROM` หรือยังไม่ได้ทำขั้นที่ 5 |
| พิมพ์รหัสใน LINE แล้วไม่มีอะไรตอบ | Webhook URL ผิด ยังไม่เปิด Use webhook หรือ Channel secret ไม่ตรง |
| `/api/cron/...` ตอบ 401 | `CRON_SECRET` ใน Vercel กับใน Supabase Vault ไม่ตรงกัน |
| เปลี่ยนค่าใน Vercel แล้วไม่มีผล | ต้อง Redeploy หลังแก้ Environment Variables |
