import { DashboardLayout } from "@/components/dashboard-layout";

export default function CallsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
