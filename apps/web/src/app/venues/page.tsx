"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PublicVenue {
  id: string;
  name: string;
  address: string;
  city: string;
}

export default function VenuesSearchPage() {
  const [query, setQuery] = useState("");
  const [venues, setVenues] = useState<PublicVenue[] | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = query ? `?query=${encodeURIComponent(query)}` : "";
      fetch(`/api/venues${params}`)
        .then((res) => res.json())
        .then((data) => setVenues(Array.isArray(data) ? data : []));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Tìm sân</h1>

      <div className="space-y-2">
        <Label htmlFor="query">Tìm theo tên, địa chỉ hoặc thành phố</Label>
        <Input
          id="query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {venues === null && <p>Đang tải...</p>}
      {venues !== null && venues.length === 0 && (
        <p className="text-muted-foreground">Không tìm thấy sân nào phù hợp.</p>
      )}

      <div className="flex flex-col gap-4">
        {venues?.map((venue) => (
          <Link key={venue.id} href={`/venues/${venue.id}`}>
            <Card className="transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle className="text-base">{venue.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-muted-foreground">
                  {venue.address}, {venue.city}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
