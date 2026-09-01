"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
      <DialogContent className="max-w-md">
        <DialogTitle>Thêm khách hàng</DialogTitle>
        <div className="flex flex-col gap-3 py-2">
          <Field label="Họ và tên" required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
          </Field>
          <Field label="Số điện thoại" required>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901 234 567" />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
          </Field>
          <Field label="Địa chỉ">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Ghi chú">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sở thích, yêu cầu đặc biệt..." />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
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
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
