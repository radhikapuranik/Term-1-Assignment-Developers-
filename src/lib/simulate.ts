/** SIMULATE_FAIL is a comma list such as "hn,devto,se,gemini,email". Used only to demonstrate failure handling. */
export function simulated(what: "hn" | "devto" | "se" | "gemini" | "email"): boolean {
  return (process.env.SIMULATE_FAIL ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(what);
}
