"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calendar,
  Clock,
  MapPin,
  Pause,
  Pencil,
  Play,
  Repeat,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import {
  dayLabel,
  formatMoney,
  formatShortDate,
  monthlyRevenueEstimate,
  sessionPriceAfterDiscount,
} from "./pricing-format";
import { RecurringScheduleEditDialog } from "./recurring-schedule-edit-dialog";
import type { CourtWithVenueName } from "../types";
import type { RecurringScheduleListItem } from "./types";

const STATUS_BADGE: Record<
  RecurringScheduleListItem["status"],
  { label: string; className: string }
> = {
  active: {
    label: "Hoạt động",
    className: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  },
  paused: {
    label: "Tạm dừng",
    className: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  },
  cancelled: {
    label: "Đã huỷ",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
};

export function RecurringSchedulesTab({
  venueId,
  courtsInVenue,
  schedules,
  monthlyRevenue,
  onOpenDetail,
  onChanged,
}: {
  venueId: string;
  courtsInVenue: CourtWithVenueName[];
  schedules: RecurringScheduleListItem[];
  monthlyRevenue: number;
  onOpenDetail: (scheduleId: string) => void;
  onChanged: () => void;
}) {
  const courtNameById = new Map(courtsInVenue.map((court) => [court.id, court.name]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-violet-600 to-purple-500 px-6 py-5 text-white">
        <div>
          <p className="text-sm text-white/80">Doanh thu cố định dự kiến tháng này</p>
          <p className="text-2xl font-bold">{formatMoney(monthlyRevenue)}</p>
        </div>
        <Wallet className="size-8 text-white/70" />
      </div>

      {schedules.length === 0 ? (
        <p className="rounded-2xl border border-dashed py-12 text-center text-muted-foreground">
          Chưa có lịch cố định – Khách đặt sân hàng tuần sẽ hiện ở đây
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {schedules.map((schedule) => (
            <RecurringScheduleCard
              key={schedule.id}
              venueId={venueId}
              courtName={courtNameById.get(schedule.courtId) ?? "—"}
              schedule={schedule}
              onOpenDetail={onOpenDetail}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecurringScheduleCard({
  venueId,
  courtName,
  schedule,
  onOpenDetail,
  onChanged,
}: {
  venueId: string;
  courtName: string;
  schedule: RecurringScheduleListItem;
  onOpenDetail: (scheduleId: string) => void;
  onChanged: () => void;
}) {
  const [togglingPause, setTogglingPause] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const status = STATUS_BADGE[schedule.status];

  async function handlePauseToggle(e: React.MouseEvent) {
    e.stopPropagation();
    setTogglingPause(true);
    const action = schedule.status === "active" ? "pause" : "resume";
    const response = await fetch(
      `/api/venues/mine/${venueId}/recurring-schedules/${schedule.id}/${action}`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => null);
    setTogglingPause(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success(action === "pause" ? "Đã tạm dừng lịch cố định" : "Đã tiếp tục lịch cố định");
    onChanged();
  }

  async function handleCancel() {
    setCancelling(true);
    const response = await fetch(
      `/api/venues/mine/${venueId}/recurring-schedules/${schedule.id}/cancel`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => null);
    setCancelling(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã huỷ lịch cố định");
    setCancelOpen(false);
    onChanged();
  }

  const isCancelled = schedule.status === "cancelled";

  return (
    <div
      className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card p-4"
      onClick={() => onOpenDetail(schedule.id)}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
          {dayLabel(schedule.dayOfWeek)}
        </div>
        <div>
          <p className="font-semibold">{schedule.customerName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {courtName}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {schedule.startTime}-{schedule.endTime}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              {formatShortDate(schedule.validFrom)} → {formatShortDate(schedule.validTo)}
            </span>
            {schedule.autoRenew && (
              <span className="flex items-center gap-1 font-medium text-violet-600 dark:text-violet-400">
                <Repeat className="size-3.5" />
                Tự gia hạn
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-bold text-blue-600 dark:text-blue-400">
            {formatMoney(sessionPriceAfterDiscount(schedule.pricePerSession, schedule.discountPercent))}
          </p>
          <p className="text-xs text-muted-foreground">/buổi</p>
          <span
            className={cn(
              "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              status.className,
            )}
          >
            {status.label}
          </span>
          <p className="mt-1 text-xs text-muted-foreground">
            ~
            {formatMoney(
              monthlyRevenueEstimate(
                sessionPriceAfterDiscount(schedule.pricePerSession, schedule.discountPercent),
              ),
            )}
            /tháng
          </p>
        </div>

        <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          <RecurringScheduleEditDialog
            venueId={venueId}
            courtName={courtName}
            schedule={schedule}
            onSaved={onChanged}
            trigger={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Sửa lịch cố định"
                disabled={isCancelled}
                className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
              >
                <Pencil className="size-3.5" />
              </Button>
            }
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={schedule.status === "active" ? "Tạm dừng lịch cố định" : "Tiếp tục lịch cố định"}
            disabled={isCancelled || togglingPause}
            onClick={handlePauseToggle}
            className="border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
          >
            {schedule.status === "active" ? (
              <Pause className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
          </Button>
          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Huỷ lịch cố định"
                  disabled={isCancelled}
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              }
            />
            <DialogContent className="max-w-sm p-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
                  <AlertTriangle className="size-8 text-red-500" />
                </div>
                <DialogTitle className="text-lg font-bold">Hủy lịch cố định?</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Hủy lịch của{" "}
                  <span className="font-semibold text-foreground">{schedule.customerName}</span>?
                </p>
              </div>
              <div className="mt-5 flex justify-center gap-3">
                <DialogClose className="rounded-lg border bg-muted/60 px-5 py-2 text-sm font-medium hover:bg-muted">
                  Hủy
                </DialogClose>
                <Button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="bg-red-600 px-5 text-white hover:bg-red-700"
                >
                  Hủy lịch
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
