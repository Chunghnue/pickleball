"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countByRole, filterStaff } from "./staff-format";
import { StaffMetrics } from "./staff-metrics";
import { StaffFilters } from "./staff-filters";
import { StaffTable } from "./staff-table";
import { StaffFormDialog } from "./staff-form-dialog";
import type { RoleTab, StaffListItem } from "./types";

export default function OwnerAccountsPage() {
  const router = useRouter();

  const [allItems, setAllItems] = useState<StaffListItem[] | null>(null);
  const [loadError, setLoadError] = useState<"forbidden" | "other" | null>(null);
  const [roleTab, setRoleTab] = useState<RoleTab>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadStaff = useCallback(() => {
    fetch("/api/staff").then(async (res) => {
      if (res.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Faccounts");
        return;
      }
      if (res.status === 403) {
        setLoadError("forbidden");
        return;
      }
      if (!res.ok) {
        setLoadError("other");
        return;
      }
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        setAllItems(data);
        setLoadError(null);
      } else {
        setLoadError("other");
      }
    });
  }, [router]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const displayItems = filterStaff(allItems ?? [], { roleTab, search: debouncedSearch });
  const counts = countByRole(allItems ?? []);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tài khoản</h1>
        <StaffFormDialog
          mode="create"
          onSaved={loadStaff}
          trigger={
            <Button
              type="button"
              className="h-10 gap-2 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
            >
              <UserPlus className="size-4" />
              Thêm nhân viên
            </Button>
          }
        />
      </div>

      {loadError === "forbidden" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Bạn không có quyền truy cập trang này.
        </div>
      )}
      {loadError === "other" && (
        <div className="rounded-xl border border-input bg-card p-6 text-center text-sm text-muted-foreground">
          Không tải được dữ liệu.
        </div>
      )}

      {!loadError && allItems && (
        <>
          <StaffMetrics counts={counts} />
          <StaffFilters
            roleTab={roleTab}
            search={search}
            onRoleTabChange={setRoleTab}
            onSearchChange={setSearch}
          />
          <StaffTable items={displayItems} onSaved={loadStaff} />
        </>
      )}
    </main>
  );
}
