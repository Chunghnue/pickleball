"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";

export function DeactivateStaffDialog({
  open,
  onOpenChange,
  staffId,
  staffName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  staffName: string;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const response = await fetch(`/api/staff/${staffId}/deactivate`, { method: "POST" });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      if (response.status === 404) {
        onOpenChange(false);
        onSaved();
      }
      return;
    }
    toast.success("Đã vô hiệu hoá tài khoản");
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
          <DialogTitle className="text-lg font-bold">Vô hiệu hoá tài khoản?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Vô hiệu hoá <span className="font-semibold text-foreground">{staffName}</span>? Nhân
            viên này sẽ không thể đăng nhập.
          </p>
        </div>
        <div className="mt-5 flex justify-center gap-3">
          <DialogClose className="rounded-lg border bg-muted/60 px-5 py-2 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            className="bg-red-600 px-5 text-white hover:bg-red-700"
          >
            Vô hiệu hoá
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
