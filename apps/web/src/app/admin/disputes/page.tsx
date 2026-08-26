"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";
import { getSubmitErrorMessage } from "@/lib/error-message";

interface DisputeRow {
  id: string;
  status: "pending" | "resolved_refund" | "rejected";
  reason: string;
  createdAt: string;
  customer: { id: string; fullName: string; email: string };
  booking: {
    id: string;
    courtName: string;
    venueName: string;
    date: string;
    startTime: string;
    endTime: string;
    totalPrice: number;
  };
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export default function AdminDisputesPage() {
  const router = useRouter();
  const [disputes, setDisputes] = useState<DisputeRow[] | null>(null);

  async function loadPending() {
    const response = await fetch("/api/admin/disputes");
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fadmin%2Fdisputes");
      return;
    }
    const data = await response.json().catch(() => []);
    setDisputes(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleResolve(row: DisputeRow, action: "refund" | "reject") {
    let note: string | undefined;
    if (action === "reject") {
      const input = window.prompt("Ghi chú (không bắt buộc):");
      if (input === null) return;
      note = input.trim() || undefined;
    } else {
      const confirmed = window.confirm(
        `Xác nhận hoàn ${currencyFormatter.format(row.booking.totalPrice)}đ cho khách hàng ${row.customer.fullName}?`,
      );
      if (!confirmed) return;
    }

    const response = await fetch(`/api/admin/disputes/${row.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success(action === "refund" ? "Đã hoàn tiền" : "Đã từ chối khiếu nại");
    loadPending();
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <AdminNav />
      <h1 className="text-2xl font-bold">Khiếu nại</h1>

      {disputes === null && <p>Đang tải...</p>}
      {disputes !== null && disputes.length === 0 && (
        <p className="text-muted-foreground">Không có khiếu nại nào đang chờ xử lý.</p>
      )}

      <div className="flex flex-col gap-4">
        {disputes?.map((row) => (
          <Card key={row.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {row.booking.courtName} · {row.booking.venueName}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {row.booking.date} · {row.booking.startTime}–{row.booking.endTime} ·{" "}
                {currencyFormatter.format(row.booking.totalPrice)}đ
              </p>
              <p className="text-sm text-muted-foreground">
                Khách hàng: {row.customer.fullName} ({row.customer.email})
              </p>
              <p className="text-sm">{row.reason}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleResolve(row, "refund")}>
                  Hoàn tiền
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleResolve(row, "reject")}
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
