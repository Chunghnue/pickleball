import { OwnerSidebar } from "@/components/owner-sidebar";
import { AppShell } from "@/components/app-shell";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sidebar={<OwnerSidebar />} accountLabel="Chủ sân" accountHref="/owner/settings">
      {children}
    </AppShell>
  );
}
