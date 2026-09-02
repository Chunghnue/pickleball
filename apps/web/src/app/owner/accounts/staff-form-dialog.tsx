"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Mail, Phone, User, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { StaffListItem, StaffRole } from "./types";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "staff", label: "Nhân viên" },
  { value: "cashier", label: "Thu ngân" },
  { value: "manager", label: "Quản lý" },
];

interface CreateProps {
  mode: "create";
  trigger: React.ReactElement;
  onSaved: () => void;
}
interface EditProps {
  mode: "edit";
  staff: StaffListItem;
  trigger: React.ReactElement;
  onSaved: () => void;
}

export function StaffFormDialog(props: CreateProps | EditProps) {
  const { trigger, onSaved, mode } = props;
  const isEdit = mode === "edit";
  const staff = props.mode === "edit" ? props.staff : undefined;

  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("staff");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(staff?.fullName ?? "");
    setPhone(staff?.phone ?? "");
    setEmail(staff?.email ?? "");
    setStaffRole(staff?.staffRole ?? "staff");
    setPassword("");
  }, [open, staff]);

  async function handleSubmit() {
    if (!fullName.trim() || !phone.trim()) {
      toast.error("Vui lòng nhập họ tên và số điện thoại");
      return;
    }
    if (!isEdit && password.trim().length < 6) {
      toast.error("Mật khẩu tối thiểu 6 ký tự");
      return;
    }

    setSubmitting(true);
    const body = isEdit
      ? {
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          staffRole,
        }
      : {
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          staffRole,
          password,
        };
    const response = await fetch(isEdit ? `/api/staff/${staff!.id}` : "/api/staff", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      if (isEdit && response.status === 404) {
        onSaved();
        setOpen(false);
      }
      return;
    }
    toast.success(isEdit ? "Đã cập nhật nhân viên" : "Đã thêm nhân viên");
    onSaved();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-cyan-400 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <UserPlus className="size-5 text-white" />
            {isEdit ? "Sửa nhân viên" : "Thêm nhân viên"}
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Họ và tên <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
                <User className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Số điện thoại <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901 234 567"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">Email</Label>
              <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Vai trò <span className="text-destructive">*</span>
              </Label>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as StaffRole)}
                className={SELECT_CLASS}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Mật khẩu <span className="text-destructive">*</span>
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="h-9"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 gap-1.5 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
            <Check className="size-4" />
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
