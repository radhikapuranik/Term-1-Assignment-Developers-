"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="wrap" style={{ paddingTop: 64 }}>
      <h1>Something went wrong</h1>
      <p className="muted" style={{ margin: "8px 0 16px" }}>{error.message}</p>
      <button type="button" className="btn" onClick={reset}>Try again</button>
    </div>
  );
}
