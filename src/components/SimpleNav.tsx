import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function SimpleNav() {
  return (
    <nav className="snav" aria-label="Site">
      <div className="snav-in">
        <Link className="brand" href="/" aria-label="Developer Community Pulse, home">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 13h4l3-9 5 17 3-8h6" /></svg>
          Pulse
        </Link>
        <div className="snav-links"><Link href="/">Dashboard</Link><Link href="/about" aria-current="page">How it works</Link></div>
        <div className="snav-tools"><ThemeToggle /></div>
      </div>
    </nav>
  );
}
