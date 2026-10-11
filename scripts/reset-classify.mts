import { q } from "../src/lib/db";
await q("update posts set relevant=null, sentiment=null, pain_point=null, seeking_help=null, classified_at=null");
console.log("classification cleared");
