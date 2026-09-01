"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Mail, MapPin, Phone, StickyNote, User, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";

export function AddCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setNote("");
    }
  }, [open]);

  async function handleSubmit() {
    if (!fullName.trim() || !phone.trim()) {
      toast.error("Vui lòng nhập họ tên và số điện thoại");
      return;
    }
    setSubmitting(true);
    const response = await fetch("/api/customer-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        note: note.trim() || undefined,
      }),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã thêm khách hàng");
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-green-400 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <UserPlus className="size-5 text-white" />
            Thêm khách hàng
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Họ và tên" required>
              <IconInput icon={User}>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </IconInput>
            </Field>
            <Field label="Số điện thoại" required>
              <IconInput icon={Phone}>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901 234 567"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </IconInput>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <IconInput icon={Mail}>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </IconInput>
            </Field>
            <Field label="Địa chỉ">
              <IconInput icon={MapPin}>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Quận 1, TP.HCM"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </IconInput>
            </Field>
          </div>

          <Field label="Ghi chú">
            <div className="flex items-start gap-2 rounded-lg border border-input px-2.5 py-2.5">
              <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Sở thích, yêu cầu đặc biệt..."
                rows={3}
                className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 gap-1.5 rounded-xl bg-green-600 px-4 font-medium text-white hover:bg-green-700"
          >
            <Check className="size-4" />
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-semibold">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function IconInput({
  icon: Icon,
  children,
}: {
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      {children}
    </div>
  );
}
