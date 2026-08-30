"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Venue {
  id: string;
  name: string;
  city: string;
  status: "pending_approval" | "active" | "rejected";
}

const STATUS_LABEL: Record<Venue["status"], string> = {
  pending_approval: "Đang chờ duyệt",
  active: "Đang hoạt động",
  rejected: "Bị từ chối",
};

const STATUS_CLASS: Record<Venue["status"], string> = {
  pending_approval: "text-amber-600",
  active: "text-emerald-600",
  rejected: "text-destructive",
};

export default function OwnerBranchesPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[] | null>(null);

  useEffect(() => {
    fetch("/api/venues/mine")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fbranches");
          return null;
        }
        return (await res.json()) as Venue[];
      })
      .then((data) => {
        if (!data) return;
        setVenues(data);
      });
  }, [router]);

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chi nhánh</h1>
        <Link href="/owner/branches/new" className={buttonVariants()}>
          Thêm chi nhánh mới
        </Link>
      </div>

      {venues === null && <p>Đang tải...</p>}
      {venues !== null && venues.length === 0 && (
        <p className="text-muted-foreground">
          Bạn chưa có địa điểm nào. Hãy thêm chi nhánh mới để bắt đầu.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {venues?.map((venue) => (
          <Link key={venue.id} href={`/owner/branches/${venue.id}`}>
            <Card className="transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle className="text-base">{venue.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {venue.city}
                </span>
                <span
                  className={`text-sm font-medium ${STATUS_CLASS[venue.status]}`}
                >
                  {STATUS_LABEL[venue.status]}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
