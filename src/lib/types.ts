// ชนิดข้อมูลที่หน้าเว็บใช้ (ตรงกับผลลัพธ์ของ RPC ในฐานข้อมูล)

export type ActionState = { ok?: boolean; error?: string; message?: string; data?: unknown } | null;

export type CompanyAccess = {
  position_id: string;
  position_title: string;
  department_id: string;
  is_owner: boolean;
  perms: Record<string, number>;
  company: { id: string; name: string; status: 'pending' | 'verified' | 'rejected' | 'suspended'; quiet_start: string; quiet_end: string };
};

export type JobCard = {
  id: string;
  title: string;
  company_id: string;
  company_name: string;
  job_type: string;
  province: string | null;
  work_mode: string;
  salary_min: number | null;
  salary_max: number | null;
  pay_unit: string;
  skills: string[];
  published_at: string;
  closes_at: string | null;
  has_challenge: boolean;
  time_limit_minutes: number | null;
  response_rate: number | null;
  response_sample: number;
  gig_days: number | null;
  match_score: number | null;
  applied: boolean;
};

export type Criterion = { name: string; weight: number; description?: string };

export type PipelineItem = {
  id: string;
  job_id: string;
  job_title: string;
  candidate_name: string;
  stage: string;
  verify_level: string;
  match_score: number;
  created_at: string;
  stage_entered_at: string;
  sla_due_at: string | null;
  candidate_due_at: string | null;
  closed_at: string | null;
  closed_by_system: boolean;
  reject_labels: string | null;
  access_revoked: boolean;
  institution_name: string | null;
  submitted_at: string | null;
  score_total: number | null;
  reused: boolean;
  interview: { status: string; starts_at: string | null } | null;
  offer_status: string | null;
};

export type Template = { id: string; kind: string; label: string; body: string; is_default: boolean };

export type Position = {
  id: string;
  parent_id: string | null;
  title: string;
  is_owner: boolean;
  is_department: boolean;
  grants: Record<string, number>;
  depth: number;
  can_manage: boolean;
  can_add_child: boolean;
  members: { user_id: string; display_name: string; joined_at: string; is_me: boolean }[];
};

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  urgent: boolean;
  read_at: string | null;
  created_at: string;
};
