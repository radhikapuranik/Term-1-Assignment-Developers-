"use client";
import { Flatline } from "@/components/Illustrations";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="wrap stage-center">
      <p className="eyebrow">Something went wrong</p>
      <h1>The pulse skipped a beat.</h1>
      <Flatline variant="error" label="A pulse line with a broken beat" />
      <p className="muted measure">{error.message || "An unexpected error happened while loading this page."} Nothing was lost.</p>
      <button type="button" className="btn" onClick={reset}>Try again</button>
    </main>
  );
}
