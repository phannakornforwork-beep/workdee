export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">กำลังโหลด</span>
      <div className="skeleton" style={{ height: 40, width: '40%' }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 220 }} />
    </div>
  );
}
