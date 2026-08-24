"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { VenueInfoSection } from "./venue-info-section";
import type { Venue } from "./types";

export default function OwnerVenueDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [venue, setVenue] = useState<Venue | null>(null);

  useEffect(() => {
    fetch(`/api/venues/mine/${params.id}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.push(`/login?returnTo=%2Fowner%2Fvenues%2F${params.id}`);
          return null;
        }
        if (res.status === 404) {
          router.push("/owner");
          return null;
        }
        return (await res.json()) as Venue;
      })
      .then((data) => {
        if (!data) return;
        setVenue(data);
      });
  }, [params.id, router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!venue) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p>Đang tải...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{venue.name}</h1>
        <Button variant="outline" onClick={handleLogout}>
          Đăng xuất
        </Button>
      </div>

      <VenueInfoSection venue={venue} onUpdated={setVenue} />
    </main>
  );
}
