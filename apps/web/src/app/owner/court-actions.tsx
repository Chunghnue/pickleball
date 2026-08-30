"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CourtFormDialog } from "./court-form-dialog";
import type { Court } from "./types";

interface VenueOption {
  id: string;
  name: string;
}

interface CourtActionsProps {
  court: Court;
  venues: VenueOption[];
  onUpdated: (court: Court) => void;
  onDeleted: (courtId: string) => void;
}

export function CourtActions({ court, venues, onUpdated, onDeleted }: CourtActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const response = await fetch(
      `/api/venues/mine/${court.venueId}/courts/${court.id}`,
      { method: "DELETE" },
    );
    setDeleting(false);
    if (response.status === 409) {
      const data = await response.json().catch(() => null);
      toast.error(
        data?.message ??
          "Sân đã có lịch sử đặt sân, hãy chuyển sang trạng thái Tạm đóng thay vì xóa.",
      );
      setDeleteOpen(false);
      return;
    }
    if (!response.ok) {
      toast.error("Không thể xóa sân, vui lòng thử lại.");
      return;
    }
    toast.success("Đã xóa sân");
    setDeleteOpen(false);
    onDeleted(court.id);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        render={<Link href={`/owner/pricing?courtId=${court.id}`} aria-label="Xem bảng giá" />}
      >
        <Eye className="size-3.5" />
      </Button>
      <CourtFormDialog
        mode="edit"
        court={court}
        venues={venues}
        onSaved={onUpdated}
        trigger={
          <Button variant="outline" size="icon-sm" aria-label="Sửa sân">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger
          render={
            <Button variant="destructive" size="icon-sm" aria-label="Xóa sân">
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
        <DialogContent className="max-w-sm">
          <DialogTitle>Xóa sân &quot;{court.name}&quot;?</DialogTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Hành động này không thể hoàn tác.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose className="rounded-lg border px-2.5 py-1.5 text-sm">
              Hủy
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              Xóa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
