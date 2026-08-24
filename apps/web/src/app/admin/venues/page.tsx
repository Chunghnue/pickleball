"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";

interface PendingVenue {
  id: string;
  name: string;
  address: string;
  city: string;
}

export default function AdminVenuesPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<PendingVenue[] | null>(null);

  async function loadPending() {
    const response = await fetch("/api/admin/venues/pending");
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fadmin%2Fvenues");
      return;
    }
    const data = await response.json().catch(() => []);
    setVenues(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleDecision(id: string, action: "approve" | "reject") {
    const response = await fetch(`/api/admin/venues/${id}/${action}`, {
      method: "POST",
    });
    if (!response.ok) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    toast.success(action === "approve" ? "Đã duyệt sân" : "Đã từ chối sân");
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
        <h1 className="text-2xl font-bold">Sân chờ duyệt</h1>
        <Button variant="outline" onClick={handleLogout}>
          Đăng xuất
        </Button>
      </div>

      {venues === null && <p>Đang tải...</p>}
      {venues !== null && venues.length === 0 && (
        <p className="text-muted-foreground">
          Không có sân nào đang chờ duyệt.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {venues?.map((venue) => (
          <Card key={venue.id}>
            <CardHeader>
              <CardTitle className="text-base">{venue.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {venue.address}, {venue.city}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleDecision(venue.id, "approve")}
                >
                  Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDecision(venue.id, "reject")}
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
