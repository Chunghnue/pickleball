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

const VIEW_CLASS =
  "border-teal-300 text-teal-600 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950/40";
const EDIT_CLASS =
  "border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40";
const DELETE_CLASS =
  "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40";

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
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        className={VIEW_CLASS}
        nativeButton={false}
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
          <Button
            variant="outline"
            size="icon-sm"
            className={EDIT_CLASS}
            aria-label="Sửa sân"
          >
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              className={DELETE_CLASS}
              aria-label="Xóa sân"
            >
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
        <DialogContent className="max-w-sm p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <Trash2 className="size-11 text-muted-foreground/70" strokeWidth={1.25} />
            <DialogTitle className="text-base font-semibold">
              Xóa sân <span className="text-blue-600">{court.name}</span>?
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Dữ liệu sân và lịch đặt liên quan sẽ không thể khôi phục.
            </p>
          </div>
          <div className="mt-5 flex gap-3">
            <DialogClose className="flex-1 rounded-lg border bg-muted/60 px-4 py-2 text-sm font-medium hover:bg-muted">
              Hủy
            </DialogClose>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 gap-1.5 bg-red-600 text-white hover:bg-red-700"
            >
              <Trash2 className="size-4" />
              Xóa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
