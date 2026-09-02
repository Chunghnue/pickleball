import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RoleTab } from "./types";

const TABS: { value: RoleTab; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "owner", label: "Chủ sân" },
  { value: "manager", label: "Quản lý" },
  { value: "cashier", label: "Thu ngân" },
  { value: "staff", label: "Nhân viên" },
];

export function StaffFilters({
  roleTab,
  search,
  onRoleTabChange,
  onSearchChange,
}: {
  roleTab: RoleTab;
  search: string;
  onRoleTabChange: (tab: RoleTab) => void;
  onSearchChange: (search: string) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const active = roleTab === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => onRoleTabChange(t.value)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
                  active
                    ? "bg-blue-600 text-white"
                    : "border text-muted-foreground hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm tên, SĐT, email..."
            className="h-9 w-56 border-0 px-0 focus-visible:ring-0"
          />
        </div>
      </CardContent>
    </Card>
  );
}
