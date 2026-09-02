"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Images, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { VenueImage } from "../types";

export function BranchImagesDialog({
  open,
  onOpenChange,
  venueId,
  images,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  images: VenueImage[];
  onSaved: () => void;
}) {
  const [items, setItems] = useState(images);
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (next) setItems(images);
    onOpenChange(next);
  }

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
    setItems((prev) => [...prev, data as VenueImage]);
    setNewUrl("");
    onSaved();
  }

  async function handleRemove(imageId: string) {
    const response = await fetch(`/api/venues/mine/${venueId}/images/${imageId}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Không thể xoá ảnh, vui lòng thử lại.");
      return;
    }
    setItems((prev) => prev.filter((image) => image.id !== imageId));
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-800 to-blue-500 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <Images className="size-5 text-white" />
            Ảnh chi nhánh
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Chưa có ảnh nào.</p>}
          <ul className="flex flex-col gap-2">
            {items.map((image) => (
              <li key={image.id} className="flex items-center justify-between gap-2">
                <a href={image.url} target="_blank" rel="noreferrer" className="truncate text-sm underline">
                  {image.url}
                </a>
                <Button type="button" variant="outline" size="icon-sm" aria-label="Xoá ảnh" onClick={() => handleRemove(image.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <Label htmlFor="newImageUrl">Thêm URL ảnh</Label>
            <div className="flex gap-2">
              <Input id="newImageUrl" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="h-9" />
              <Button type="button" onClick={handleAdd} className="h-9">
                Thêm
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
