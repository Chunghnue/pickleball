import { OwnerSidebar } from "@/components/owner-sidebar";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <OwnerSidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
