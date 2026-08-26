"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";

interface PendingOwnerRow {
  type: "owner";
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  submittedAt: string;
}

interface PendingVenueRow {
  type: "venue";
  id: string;
  name: string;
  address: string;
  city: string;
  submittedAt: string;
  owner: {
    id: string;
    fullName: string;
    status: string;
  };
}

type ApprovalRow = PendingOwnerRow | PendingVenueRow;

const OWNER_STATUS_LABELS: Record<string, string> = {
  pending_verification: "Chưa xác thực email",
  pending_approval: "Chờ duyệt",
  active: "Đã duyệt",
  rejected: "Đã từ chối",
  suspended: "Đã khoá",
};

export default function AdminApprovalsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);

  async function loadPending() {
    const response = await fetch("/api/admin/approvals");
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fadmin%2Fapprovals");
      return;
    }
    const data = await response.json().catch(() => []);
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleDecision(row: ApprovalRow, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      const input = window.prompt("Lý do từ chối (không bắt buộc):");
      if (input === null) return;
      reason = input.trim() || undefined;
    }

    const basePath = row.type === "owner" ? "/api/admin/owners" : "/api/admin/venues";
    const response = await fetch(`${basePath}/${row.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    toast.success(action === "approve" ? "Đã duyệt" : "Đã từ chối");
    loadPending();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <AdminNav />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chờ duyệt</h1>
        <Button variant="outline" onClick={handleLogout}>
          Đăng xuất
        </Button>
      </div>

      {rows === null && <p>Đang tải...</p>}
      {rows !== null && rows.length === 0 && (
        <p className="text-muted-foreground">Không có gì đang chờ duyệt.</p>
      )}

      <div className="flex flex-col gap-4">
        {rows?.map((row) => (
          <Card key={`${row.type}-${row.id}`}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase text-muted-foreground">
                  {row.type === "owner" ? "Chủ sân" : "Chi nhánh"}
                </span>
                {row.type === "owner" ? row.fullName : row.name}
                {row.type === "venue" && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Chủ sân: {OWNER_STATUS_LABELS[row.owner.status] ?? row.owner.status}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {row.type === "owner" ? row.email : `${row.address}, ${row.city}`}
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleDecision(row, "approve")}>
                  Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDecision(row, "reject")}
                >
                  Từ chối
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
