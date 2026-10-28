export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">กำลังโหลด</span>
      <div className="card tight" style={{ height: 64, background: 'var(--bg-2)', border: 'none' }} />
      <div className="card" style={{ height: 220, background: 'var(--bg-2)', border: 'none' }} />
    </div>
  );
}
