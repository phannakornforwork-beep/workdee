import type { ActionState } from '@/lib/types';

type ErrorLike = { message?: string; code?: string; details?: string } | null | undefined;

// แปลงข้อผิดพลาดจากฐานข้อมูลเป็นข้อความภาษาไทยที่แสดงให้ผู้ใช้ได้
export function errorMessage(err: ErrorLike | unknown): string {
  const e = err as ErrorLike;
  const msg = e?.message || '';
  if (!msg) return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
  if (/JWT|session|not authenticated|เข้าสู่ระบบ/i.test(msg)) return 'กรุณาเข้าสู่ระบบใหม่';
  if (/row-level security|permission denied/i.test(msg)) return 'คุณไม่มีสิทธิ์ทำรายการนี้';
  if (/duplicate key/i.test(msg)) return 'มีข้อมูลนี้อยู่แล้ว';
  if (/violates check constraint/i.test(msg)) return 'ข้อมูลบางช่องไม่ถูกต้อง ตรวจความยาวหรือรูปแบบอีกครั้ง';
  if (/invalid input syntax/i.test(msg)) return 'รูปแบบข้อมูลไม่ถูกต้อง';
  return msg;
}

export function fail(err: unknown): ActionState {
  return { ok: false, error: errorMessage(err) };
}

export function done(message?: string, data?: unknown): ActionState {
  return { ok: true, message, data };
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export function num(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace(/,/g, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === 'on' || v === 'true' || v === '1';
}

export function list(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function all(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === 'string' && v.length > 0);
}

// ป้องกัน open redirect
export function safeNext(next: string | null | undefined, fallback = '/spaces'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}
