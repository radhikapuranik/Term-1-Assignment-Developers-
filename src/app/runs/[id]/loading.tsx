export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Loading dashboard" style={{ paddingTop: 72 }}>
      <svg className="loadline" viewBox="0 0 360 60" aria-hidden="true"><path pathLength={1} d="M2 30 L120 30 L132 30 Q136 22 140 30 L146 38 L158 6 L170 52 L180 30 L200 30 Q206 22 212 30 L358 30" /></svg>
      <div className="skel" style={{ height: 72, width: "min(640px, 90%)", marginTop: 28 }} />
      <div className="skel" style={{ height: 72, width: "min(480px, 70%)", marginTop: 12 }} />
      <div className="skel" style={{ height: 200, marginTop: 48 }} />
      <p className="sr-only" role="status">Loading the dashboard</p>
    </div>
  );
}
