"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";

export function ResetPasswordDialog({
  open,
  onOpenChange,
  staffId,
  staffName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  staffName: string;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setNewPassword("");
  }, [open]);

  async function handleSubmit() {
    if (newPassword.trim().length < 6) {
      toast.error("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    setSubmitting(true);
    const response = await fetch(`/api/staff/${staffId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      if (response.status === 404) {
        onOpenChange(false);
      }
      return;
    }
    toast.success("Đã đặt lại mật khẩu");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-amber-600 to-orange-400 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-white">
            <KeyRound className="size-5 text-white" />
            Đặt lại mật khẩu
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          <p className="text-sm text-muted-foreground">
            Đặt lại mật khẩu cho <span className="font-semibold text-foreground">{staffName}</span>
          </p>
          <div className="space-y-1.5">
            <Label className="font-semibold">
              Mật khẩu mới <span className="text-destructive">*</span>
            </Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              autoComplete="new-password"
              className="h-9"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 gap-1.5 rounded-xl bg-amber-600 px-4 font-medium text-white hover:bg-amber-700"
          >
            <Check className="size-4" />
            Xác nhận
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
