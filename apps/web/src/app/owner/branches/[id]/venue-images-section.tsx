"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VenueImage } from "../../types";

interface VenueImagesSectionProps {
  venueId: string;
  images: VenueImage[];
  onImagesChanged: (images: VenueImage[]) => void;
}

export function VenueImagesSection({
  venueId,
  images,
  onImagesChanged,
}: VenueImagesSectionProps) {
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    const response = await fetch(`/api/venues/mine/${venueId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: newUrl }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setError(data?.message ?? "URL không hợp lệ");
      return;
    }

    onImagesChanged([...images, data as VenueImage]);
    setNewUrl("");
    toast.success("Đã thêm ảnh");
  }

  async function handleRemove(imageId: string) {
    const response = await fetch(
      `/api/venues/mine/${venueId}/images/${imageId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      toast.error("Không thể xoá ảnh, vui lòng thử lại.");
      return;
    }
    onImagesChanged(images.filter((image) => image.id !== imageId));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ảnh</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {images.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có ảnh nào.</p>
        )}
        <ul className="flex flex-col gap-2">
          {images.map((image) => (
            <li
              key={image.id}
              className="flex items-center justify-between gap-2"
            >
              <a
                href={image.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-sm underline"
              >
                {image.url}
              </a>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => handleRemove(image.id)}
              >
                Xoá
              </Button>
            </li>
          ))}
        </ul>
        <div className="space-y-2">
          <Label htmlFor="newImageUrl">Thêm URL ảnh</Label>
          <div className="flex gap-2">
            <Input
              id="newImageUrl"
              value={newUrl}
              onChange={(event) => setNewUrl(event.target.value)}
            />
            <Button type="button" onClick={handleAdd}>
              Thêm
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
