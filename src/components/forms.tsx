'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/lib/types';

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

// ฟอร์มที่แสดงผลสำเร็จ/ผิดพลาดจาก Server Action
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  id
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className || 'stack'} id={id}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error)
    return (
      <div className="alert error" role="alert">
        {state.error}
      </div>
    );
  if (state.message)
    return (
      <div className="alert success" role="status">
        {state.message}
      </div>
    );
  return null;
}

export function SubmitButton({
  children,
  className = 'btn',
  pendingText = 'กำลังบันทึก…',
  name,
  value,
  disabled
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} name={name} value={value}>
      {pending ? pendingText : children}
    </button>
  );
}

// ปุ่มที่ต้องกดยืนยันอีกครั้ง (แทน window.confirm)
export function ConfirmSubmit({
  children,
  confirmText = 'กดอีกครั้งเพื่อยืนยัน',
  className = 'btn ghost',
  name,
  value
}: {
  children: React.ReactNode;
  confirmText?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed)
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  return (
    <button type="submit" className={`${className} danger`} disabled={pending} name={name} value={value}>
      {pending ? 'กำลังทำ…' : confirmText}
    </button>
  );
}
