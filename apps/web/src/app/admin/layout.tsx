import { AdminSidebar } from "@/components/admin-sidebar";
import { AppHeader } from "@/components/app-header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <AppHeader accountLabel="Quản trị viên" />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
