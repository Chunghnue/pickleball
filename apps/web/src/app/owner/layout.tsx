import { OwnerSidebar } from "@/components/owner-sidebar";
import { AppHeader } from "@/components/app-header";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <OwnerSidebar />
      <div className="flex flex-1 flex-col">
        <AppHeader accountLabel="Chủ sân" accountHref="/owner/settings" />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
