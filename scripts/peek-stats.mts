import { q } from "../src/lib/db";
const rows = await q("select w.category, w.current_count c, w.previous_count p, w.trend_label, w.data_status from weekly_stats w join runs r on r.id=w.run_id where w.level='category' and r.id = (select id from runs order by started_at desc limit 1) order by 1");
console.table(rows);
