"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CalendarPlus, Clock, Hash, Phone, StickyNote, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { avatarColor, avatarInitials, formatShortDate } from "./customer-format";
import { TierBadge } from "./tier-badge";
import type { CustomerDetail, CustomerKind } from "./types";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function CustomerDetailDialog({
  open,
  onOpenChange,
  target,
  onBookForCustomer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { kind: CustomerKind; id: string } | null;
  onBookForCustomer: (customer: CustomerDetail) => void;
}) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  useEffect(() => {
    if (!open || !target) {
      setDetail(null);
      return;
    }
    setDetail(null);
    fetch(`/api/customers/${target.kind}/${target.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDetail(data));
  }, [open, target]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4">
          <DialogTitle className="text-lg font-semibold text-white">Chi tiết khách hàng</DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>

        {detail === null ? (
          <p className="px-6 py-12 text-center text-muted-foreground">Đang tải...</p>
        ) : (
          <div className="flex flex-col gap-6 px-6 py-6 sm:flex-row">
            <div className="flex shrink-0 flex-col items-center text-center sm:w-44">
              <span
                className={`flex size-24 items-center justify-center rounded-full text-3xl font-bold text-white ${avatarColor(detail.fullName)}`}
              >
                {avatarInitials(detail.fullName)}
              </span>
              <p className="mt-3 text-lg font-bold">{detail.fullName}</p>
              <div className="mt-1.5">
                <TierBadge tier={detail.tier} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Phone className="size-3.5" />
                {detail.phone ?? "—"}
              </p>
            </div>

            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/50 p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {detail.totalBookings}
                  </p>
                  <p className="text-sm text-muted-foreground">Lượt đặt</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-4 text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {currencyFormatter.format(detail.totalSpent)}đ
                  </p>
                  <p className="text-sm text-muted-foreground">Tổng chi tiêu</p>
                </div>
              </div>

              <div className="divide-y divide-border">
                <InfoRow icon={CalendarDays} label="Lần đặt cuối" value={formatShortDate(detail.lastBookingAt)} />
                <InfoRow icon={Hash} label="Mã KH" value={detail.customerCode} />
                <InfoRow icon={Clock} label="Ngày tham gia" value={formatShortDate(detail.joinedAt)} />
                {detail.note && <InfoRow icon={StickyNote} label="Ghi chú" value={detail.note} />}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Đóng
          </DialogClose>
          {detail && (
            <Button
              type="button"
              onClick={() => onBookForCustomer(detail)}
              className="h-10 gap-2 rounded-xl bg-green-600 px-4 font-medium text-white hover:bg-green-700"
            >
              <CalendarPlus className="size-4" />
              Đặt sân cho khách này
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
