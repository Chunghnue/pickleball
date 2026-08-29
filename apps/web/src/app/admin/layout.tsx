import { AdminSidebar } from "@/components/admin-sidebar";
import { AppShell } from "@/components/app-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sidebar={<AdminSidebar />} accountLabel="Quản trị viên">
      {children}
    </AppShell>
  );
}
