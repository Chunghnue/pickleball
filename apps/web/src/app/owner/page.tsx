"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function OwnerDashboardPage() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Chào chủ sân</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Bạn đã đăng nhập với vai trò chủ sân. Tính năng quản lý sân sẽ sớm
            ra mắt.
          </p>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            Đăng xuất
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
