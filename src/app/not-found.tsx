import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap" style={{ paddingTop: 64 }}>
      <h1>Page not found</h1>
      <p className="muted" style={{ margin: "8px 0 16px" }}>That address does not exist on this dashboard.</p>
      <Link href="/">Back to the dashboard</Link>
    </div>
  );
}
