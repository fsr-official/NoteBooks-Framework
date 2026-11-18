export default function ReadLoading() {
  return (
    <main className="read-route-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="read-route-loading-card">
        <span className="read-route-loading-mark" aria-hidden="true">n</span>
        <span className="read-route-loading-spinner" aria-hidden="true" />
        <strong>Rendering your notes</strong>
        <span>Opening the file and preparing its content…</span>
      </div>
    </main>
  );
}
