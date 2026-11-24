import Link from 'next/link';

// ชิ้นส่วนตัวตนของ WorkDee: "ผลงานพูดแทนประสบการณ์"
// ภาพประจำแบรนด์คือ "ใบผลงาน" = คะแนนรายเกณฑ์ + คำแนะนำ ซึ่งเว็บหางานทั่วไปไม่มี

const SAMPLE = [
  { name: 'เข้าใจกลุ่มลูกค้า', weight: 40, score: 36 },
  { name: 'ความคิดสร้างสรรค์', weight: 35, score: 27 },
  { name: 'อธิบายเหตุผลได้', weight: 25, score: 19 }
];

// ใบผลงานตัวอย่าง (ข้อมูลสมมติ ระบุชัดว่าเป็นตัวอย่าง)
export function SampleResult() {
  const total = SAMPLE.reduce((s, c) => s + c.score, 0);
  return (
    <figure className="result-card" aria-label="ตัวอย่างใบผลงานหลังทำโจทย์">
      <div className="result-head">
        <span className="result-tag">ตัวอย่างใบผลงาน</span>
        <span className="result-title">โจทย์: วางแผนโพสต์โปรโมชัน 1 สัปดาห์</span>
      </div>
      <div className="result-total">
        <strong>{total}</strong>
        <span>/100</span>
      </div>
      <ul className="rubric">
        {SAMPLE.map((c) => (
          <li key={c.name}>
            <span className="rubric-name">{c.name}</span>
            <span className="rubric-bar" aria-hidden="true">
              <span style={{ width: `${(c.score / c.weight) * 100}%` }} />
            </span>
            <span className="rubric-score">
              {c.score}/{c.weight}
            </span>
          </li>
        ))}
      </ul>
      <p className="result-note">“เลือกช่วงเวลาโพสต์ได้ดี ลองเพิ่มตัวเลขวัดผลในแผน”</p>
      <div className="result-foot">
        <span>✓ ใช้กับบริษัทที่รับผลเดิมได้</span>
        <span>✓ ผลงานเป็นของคุณ</span>
      </div>
    </figure>
  );
}

// ตัวเลขจริงจากระบบ (ไม่มีตัวเลขสมมติ)
export function ProofBand({ jobs, companies }: { jobs: number; companies: number }) {
  return (
    <div className="proof-band">
      <div>
        <strong>{jobs}</strong>
        <span>งานที่เปิดรับ</span>
      </div>
      <div>
        <strong>{companies}</strong>
        <span>บริษัทที่ยืนยันแล้ว</span>
      </div>
      <div>
        <strong>7 วัน</strong>
        <span>ได้คำตอบทุกใบสมัคร</span>
      </div>
      <div>
        <strong>≤ 2 ชม.</strong>
        <span>เวลาทำโจทย์สูงสุด</span>
      </div>
    </div>
  );
}

const DIFF: [string, string, string][] = [
  ['บริษัทตัดสินจาก', 'ประสบการณ์ในเรซูเม่', 'ผลงานจริง ให้คะแนนตามเกณฑ์'],
  ['หลังกดสมัคร', 'อาจเงียบหายไปเลย', 'ได้คำตอบใน 7 วัน ไม่ผ่านได้เหตุผล'],
  ['โจทย์ทดสอบ', 'ทำใหม่ทุกบริษัท', 'ใช้ผลเดิมกับบริษัทที่เปิดรับได้'],
  ['วุฒิการศึกษา', 'พิมพ์เอง', 'ยืนยันด้วยเอกสาร มีป้ายกำกับ']
];

// ตารางเปรียบเทียบ: เว็บหางานทั่วไป vs WorkDee
export function DiffTable() {
  return (
    <div className="diff-table" role="table" aria-label="ต่างจากเว็บหางานทั่วไปอย่างไร">
      <div className="diff-row diff-headrow" role="row">
        <span role="columnheader" />
        <span role="columnheader">เว็บหางานทั่วไป</span>
        <span role="columnheader">WorkDee</span>
      </div>
      {DIFF.map(([k, a, b]) => (
        <div key={k} className="diff-row" role="row">
          <span role="rowheader">{k}</span>
          <span role="cell" className="diff-old">
            {a}
          </span>
          <span role="cell" className="diff-new">
            {b}
          </span>
        </div>
      ))}
    </div>
  );
}

// AI ที่ยุติธรรม: 3 ข้อ
export function FairAi() {
  return (
    <div className="fair-ai">
      <div>
        <span className="fair-n">1</span>
        <h3>AI อ่านและร่าง</h3>
        <p className="muted">อ่าน CV จับคู่ทักษะกับงาน และร่างคะแนนโจทย์พร้อมเหตุผล</p>
      </div>
      <div>
        <span className="fair-n">2</span>
        <h3>คนเป็นผู้ตัดสิน</h3>
        <p className="muted">คะแนนนับเมื่อบริษัทยืนยันเท่านั้น และเก็บร่างของ AI ไว้ตรวจย้อนได้</p>
      </div>
      <div>
        <span className="fair-n">3</span>
        <h3>ไม่ดูว่าคุณเป็นใคร</h3>
        <p className="muted">ไม่ใช้ชื่อ อายุ เพศ รูป หรือสถาบันในการให้คะแนน</p>
      </div>
    </div>
  );
}

// ภาพจำลองกระดานผู้สมัคร (สำหรับหน้าบริษัท) ใช้ HTML ล้วน ไม่ใช่รูปภาพ
export function PipelineMock() {
  const cols: [string, [string, string, string][]][] = [
    ['รอคัด', [['ปาริชาติ', '88%', 'เหลือ 5 วัน'], ['ธนกร', '74%', 'เหลือ 2 วัน']]],
    ['ทำโจทย์', [['สุนิสา', '81%', 'ส่งแล้ว · รอให้คะแนน']]],
    ['สัมภาษณ์', [['ณัฐวุฒิ', '92%', 'นัดแล้ว พฤ. 10:00']]]
  ];
  return (
    <div className="mock-window" aria-label="ภาพจำลองกระดานผู้สมัคร">
      <div className="mock-bar">
        <span />
        <span />
        <span />
        <em>กระดานผู้สมัคร</em>
      </div>
      <div className="mock-board">
        {cols.map(([title, cards]) => (
          <div key={title} className="mock-col">
            <b>
              {title} <small>{cards.length}</small>
            </b>
            {cards.map(([n, m, s]) => (
              <div key={n} className="mock-card">
                <span className="row-between">
                  <strong>{n}</strong>
                  <span className="score">{m}</span>
                </span>
                <small className={s.includes('2 วัน') ? 'due' : ''}>{s}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// แถบคำสัญญาที่ใช้ครั้งเดียวต่อหน้า (แทนการซ้ำบนทุกการ์ด)
export function PromiseBar() {
  return (
    <div className="promise-bar">
      <strong>ทุกงานบน WorkDee</strong>
      <span>✓ ได้คำตอบใน 7 วัน</span>
      <span>✓ บอกเงินเดือนชัด</span>
      <span>✓ ไม่ผ่านได้เหตุผล</span>
      <Link href="/#how">ทำงานอย่างไร</Link>
    </div>
  );
}
