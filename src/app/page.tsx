import { BriefView } from "@/components/BriefView";
import { loadDashboard } from "@/lib/dashboard-data";

export const revalidate = 60;

export default async function Home() {
  const data = await loadDashboard(undefined, { overlay: true });
  return <BriefView data={data} />;
}
