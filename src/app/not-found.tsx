import Link from "next/link";
import { Flatline } from "@/components/Illustrations";
import { SimpleNav } from "@/components/SimpleNav";

export default function NotFound() {
  return (
    <>
      <SimpleNav />
      <main id="main" className="wrap stage-center">
        <p className="eyebrow">Error 404</p>
        <h1>This page flatlined.</h1>
        <Flatline variant="notfound" label="A pulse line that goes flat and ends in a cross" />
        <p className="muted measure">We could not find that address. The dashboard itself is alive and well.</p>
        <Link className="btn" href="/" style={{ textDecoration: "none" }}>Back to the dashboard</Link>
      </main>
    </>
  );
}
