"use client";

import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { avatarInitials, formatShortDate } from "./customer-format";
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
      <DialogContent className="max-w-md">
        <DialogTitle>Chi tiết khách hàng</DialogTitle>
        {detail === null ? (
          <p className="py-6 text-center text-muted-foreground">Đang tải...</p>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-base font-semibold">
                {avatarInitials(detail.fullName)}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold">{detail.fullName}</p>
                  <TierBadge tier={detail.tier} />
                </div>
                <p className="text-sm text-muted-foreground">{detail.phone ?? "—"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Lượt đặt" value={String(detail.totalBookings)} />
              <Stat label="Tổng chi tiêu" value={`${currencyFormatter.format(detail.totalSpent)}đ`} />
            </div>

            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <Info label="Lần đặt cuối" value={formatShortDate(detail.lastBookingAt)} />
              <Info label="Mã KH" value={detail.customerCode} />
              <Info label="Ngày tham gia" value={formatShortDate(detail.joinedAt)} />
              {detail.note && <Info label="Ghi chú" value={detail.note} />}
            </dl>

            <Button
              type="button"
              onClick={() => onBookForCustomer(detail)}
              className="h-10 w-full gap-2 rounded-xl bg-green-600 font-medium text-white hover:bg-green-700"
            >
              <CalendarPlus className="size-4" />
              Đặt sân cho khách này
            </Button>
          </div>
        )}
        <div className="flex justify-end">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Đóng
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
