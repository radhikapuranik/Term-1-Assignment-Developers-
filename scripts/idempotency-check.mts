import { sendEmail } from "../src/lib/email";
const key = `idempotency-test-${Date.now()}`;
const args = { to: process.env.RECIPIENT_EMAIL!, subject: "Developer Community Pulse: idempotency test (you should receive this once)", html: "<p>Idempotency test. Sent twice with the same key; only one copy should arrive.</p>", text: "Idempotency test. Sent twice with the same key; only one copy should arrive.", idempotencyKey: key };
const a = await sendEmail(args);
const b = await sendEmail(args);
console.log("first :", a.ok ? "sent, id " + a.id : a.error);
console.log("second:", b.ok ? "accepted, id " + b.id : b.error);
console.log(a.ok && b.ok && a.id === b.id ? "SAME id returned, so Resend treated the second call as a repeat (no duplicate)." : "ids differ or a call failed");
