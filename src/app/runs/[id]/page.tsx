import type { Metadata } from "next";
import { BriefView } from "@/components/BriefView";
import { loadDashboard } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Past brief" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const valid = /^[0-9a-f-]{36}$/i.test(id);
  const data = await loadDashboard(valid ? id : "00000000-0000-0000-0000-000000000000");
  return <BriefView data={data} showRunNow={false} />;
}
