export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Loading dashboard">
      <div className="skel" style={{ height: 28, width: 320, marginTop: 28 }} />
      <div className="skel" style={{ height: 16, width: 520, maxWidth: "100%", marginTop: 12 }} />
      <div className="skel" style={{ height: 120, marginTop: 28 }} />
      <div className="skel" style={{ height: 160, marginTop: 28 }} />
      <div className="skel" style={{ height: 300, marginTop: 28 }} />
    </div>
  );
}
