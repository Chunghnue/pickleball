"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { dayLabel, formatMoney, formatShortDate, sessionPriceAfterDiscount } from "./pricing-format";
import type { RecurringScheduleDetail } from "./types";

const OCCURRENCE_STATUS_LABEL: Record<string, string> = {
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

export function RecurringScheduleDetailDialog({
  open,
  onOpenChange,
  venueId,
  scheduleId,
  onCancelled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  scheduleId: string | null;
  onCancelled: () => void;
}) {
  const [detail, setDetail] = useState<RecurringScheduleDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!open || !scheduleId) {
      setDetail(null);
      setConfirmCancel(false);
      return;
    }
    setDetail(null);
    fetch(`/api/venues/mine/${venueId}/recurring-schedules/${scheduleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDetail(data));
  }, [open, scheduleId, venueId]);

  async function handleCancel() {
    if (!scheduleId) return;
    setCancelling(true);
    const response = await fetch(
      `/api/venues/mine/${venueId}/recurring-schedules/${scheduleId}/cancel`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => null);
    setCancelling(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã huỷ lịch cố định");
    setConfirmCancel(false);
    onCancelled();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Chi tiết lịch cố định</DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </DialogClose>
        </div>

        {detail === null ? (
          <p className="px-6 py-12 text-center text-muted-foreground">Đang tải...</p>
        ) : (
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Thứ + khung giờ</p>
                <p className="font-medium">
                  {dayLabel(detail.schedule.dayOfWeek)}, {detail.schedule.startTime} -{" "}
                  {detail.schedule.endTime}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Giá/buổi (sau giảm)</p>
                <p className="font-medium">
                  {formatMoney(
                    sessionPriceAfterDiscount(
                      detail.schedule.pricePerSession,
                      detail.schedule.discountPercent,
                    ),
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Từ ngày - Đến ngày</p>
                <p className="font-medium">
                  {formatShortDate(detail.schedule.validFrom)} -{" "}
                  {formatShortDate(detail.schedule.validTo)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tự động gia hạn</p>
                <p className="font-medium">{detail.schedule.autoRenew ? "Có" : "Không"}</p>
              </div>
              {detail.schedule.note && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Ghi chú</p>
                  <p className="font-medium">{detail.schedule.note}</p>
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-sm font-semibold">
                Các buổi đã sinh ({detail.occurrences.length})
              </p>
              <div className="max-h-52 overflow-y-auto rounded-lg border">
                {detail.occurrences.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                    Chưa có buổi nào
                  </p>
                ) : (
                  <ul className="divide-y">
                    {detail.occurrences.map((occurrence) => (
                      <li
                        key={occurrence.id}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span>
                          {formatShortDate(occurrence.date)} · {occurrence.startTime}-
                          {occurrence.endTime}
                        </span>
                        <span className="text-muted-foreground">
                          {OCCURRENCE_STATUS_LABEL[occurrence.status] ?? occurrence.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {detail.schedule.status === "active" &&
              (confirmCancel ? (
                <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                  <p className="text-sm">Huỷ toàn bộ buổi trong tương lai của lịch này?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      className="rounded-lg border px-3 py-1.5 text-sm font-medium"
                    >
                      Không
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      Xác nhận huỷ
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmCancel(true)}
                  className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                >
                  <Ban className="size-4" />
                  Huỷ lịch cố định
                </Button>
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
