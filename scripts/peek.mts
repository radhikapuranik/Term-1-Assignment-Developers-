import { q } from "../src/lib/db";
const r = await q("select id, run_type, status, attempts, left(error, 700) as error, started_at, finished_at from runs order by started_at desc limit 3");
console.log(JSON.stringify(r, null, 1));
console.log(await q("select count(*) posts, count(classified_at) classified from posts"));
console.log(await q("select run_id, email_status, email_error from briefs"));
