"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { BranchListItem } from "./types";

export function DeleteBranchDialog({
  open,
  onOpenChange,
  venue,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue: BranchListItem;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const response = await fetch(`/api/venues/mine/${venue.id}`, { method: "DELETE" });
    setSubmitting(false);
    if (!response.ok) {
      if (response.status === 409) {
        toast.error(
          'Chi nhánh đã có lịch sử đặt sân, không thể xoá. Dùng "Sửa" → Ẩn để ẩn khỏi trang công khai thay thế.',
        );
      } else {
        toast.error("Không thể xoá chi nhánh, vui lòng thử lại.");
      }
      onOpenChange(false);
      return;
    }
    toast.success("Đã xoá chi nhánh");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
            <AlertTriangle className="size-8 text-red-500" />
          </div>
          <DialogTitle className="text-lg font-bold">Xoá chi nhánh?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Xoá <span className="font-semibold text-foreground">{venue.name}</span>? Hành động này không thể hoàn tác.
          </p>
        </div>
        <div className="mt-5 flex justify-center gap-3">
          <DialogClose className="rounded-lg border bg-muted/60 px-5 py-2 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button onClick={handleConfirm} disabled={submitting} className="bg-red-600 px-5 text-white hover:bg-red-700">
            Xoá
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
