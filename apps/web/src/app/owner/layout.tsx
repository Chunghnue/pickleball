import { OwnerSidebar } from "@/components/owner-sidebar";
import { AppShell } from "@/components/app-shell";
import { BranchProvider } from "@/lib/branch-context";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <BranchProvider>
      <AppShell sidebar={<OwnerSidebar />} accountHref="/owner/settings">
        {children}
      </AppShell>
    </BranchProvider>
  );
}
