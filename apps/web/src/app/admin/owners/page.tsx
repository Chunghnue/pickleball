"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PendingOwner {
  id: string;
  email: string;
  fullName: string;
}

export default function AdminOwnersPage() {
  const router = useRouter();
  const [owners, setOwners] = useState<PendingOwner[] | null>(null);

  async function loadPending() {
    const response = await fetch("/api/admin/owners/pending");
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fadmin%2Fowners");
      return;
    }
    const data = await response.json().catch(() => []);
    setOwners(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleDecision(id: string, action: "approve" | "reject") {
    const response = await fetch(`/api/admin/owners/${id}/${action}`, {
      method: "POST",
    });
    if (!response.ok) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    toast.success(action === "approve" ? "Đã duyệt chủ sân" : "Đã từ chối chủ sân");
    loadPending();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chủ sân chờ duyệt</h1>
        <Button variant="outline" onClick={handleLogout}>
          Đăng xuất
        </Button>
      </div>

      {owners === null && <p>Đang tải...</p>}
      {owners !== null && owners.length === 0 && (
        <p className="text-muted-foreground">Không có chủ sân nào đang chờ duyệt.</p>
      )}

      <div className="flex flex-col gap-4">
        {owners?.map((owner) => (
          <Card key={owner.id}>
            <CardHeader>
              <CardTitle className="text-base">{owner.fullName}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{owner.email}</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleDecision(owner.id, "approve")}>
                  Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDecision(owner.id, "reject")}
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
