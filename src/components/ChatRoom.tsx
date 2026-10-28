'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ChatMessage = {
  id: number;
  room_id: string;
  sender_id: string | null;
  sender_name: string;
  sender_side: string;
  body: string;
  is_announcement: boolean;
  urgent: boolean;
  created_at: string;
};

function time(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

// ห้องแชตแบบเรียลไทม์ (Supabase Realtime เคารพสิทธิ์ RLS ของแต่ละคน)
export function ChatRoom({
  roomId,
  meId,
  initial,
  canAnnounce = false,
  canUrgent = false,
  placeholder = 'พิมพ์ข้อความ',
  quietNote,
  afterSend
}: {
  roomId: string;
  meId: string;
  initial: ChatMessage[];
  canAnnounce?: boolean;
  canUrgent?: boolean;
  placeholder?: string;
  quietNote?: string;
  afterSend?: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const markRead = useCallback(() => {
    supabase.rpc('mark_room_read', { p_room: roomId }).then(() => undefined);
  }, [roomId, supabase]);

  useEffect(() => {
    markRead();
    const channel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` }, (payload: { new: unknown }) => {
        const m = payload.new as ChatMessage;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        markRead();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase, markRead]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [messages.length]);

  async function refresh() {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, room_id, sender_id, sender_name, sender_side, body, is_announcement, urgent, created_at')
      .eq('room_id', roomId)
      .order('id', { ascending: true })
      .limit(200);
    if (data) setMessages(data as ChatMessage[]);
  }

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError('');
    const { error: err } = await supabase.rpc('post_chat_message', { p_room: roomId, p_body: body, p_announcement: announce, p_urgent: urgent });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setText('');
    setAnnounce(false);
    setUrgent(false);
    refresh();
    // ให้เซิร์ฟเวอร์ส่งแจ้งเตือน LINE/อีเมลที่ถึงเวลาแล้วทันที
    afterSend?.().catch(() => undefined);
  }

  return (
    <div className="stack">
      <div className="chat" ref={box} aria-live="polite">
        {messages.length === 0 ? <p className="muted small">ยังไม่มีข้อความ</p> : null}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_id === meId ? 'me' : ''} ${m.is_announcement ? 'announce' : ''}`}>
            <span className="meta">
              {m.is_announcement ? 'ประกาศ · ' : ''}
              {m.urgent ? 'ด่วน · ' : ''}
              {m.sender_name} · {time(m.created_at)}
            </span>
            <span className="text">{m.body}</span>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="stack-sm">
        <label className="sr-only" htmlFor={`chat-${roomId}`}>
          ข้อความ
        </label>
        <textarea id={`chat-${roomId}`} className="textarea" style={{ minHeight: 70 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={4000} />
        <div className="row">
          {canAnnounce ? (
            <label className="check">
              <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} /> ส่งเป็นประกาศ (ดูได้ว่าใครอ่านแล้ว)
            </label>
          ) : null}
          {canUrgent ? (
            <label className="check">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> ด่วน
            </label>
          ) : null}
          <button type="submit" className="btn right" disabled={sending || !text.trim()}>
            {sending ? 'กำลังส่ง…' : 'ส่ง'}
          </button>
        </div>
        {quietNote ? <span className="hint">{quietNote}</span> : null}
        {error ? <div className="alert error">{error}</div> : null}
      </form>
    </div>
  );
}
