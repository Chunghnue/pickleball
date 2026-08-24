"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Status = "loading" | "success" | "error";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Thiếu token xác thực.");
      return;
    }

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setStatus("error");
          setMessage(data?.message ?? "Xác thực thất bại.");
          return;
        }
        setStatus("success");
        setMessage(
          data.status === "pending_approval"
            ? "Xác thực email thành công. Tài khoản của bạn đang chờ admin duyệt."
            : "Xác thực email thành công. Bạn có thể đăng nhập ngay.",
        );
      })
      .catch(() => {
        setStatus("error");
        setMessage("Có lỗi xảy ra, vui lòng thử lại.");
      });
  }, [token]);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Xác thực email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && <p>Đang xác thực...</p>}
          {status !== "loading" && <p>{message}</p>}
          {status === "success" && (
            <Link href="/login" className="underline">
              Đến trang đăng nhập
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
