import { BriefView } from "@/components/BriefView";
import { loadDashboard } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await loadDashboard();
  return <BriefView data={data} />;
}
