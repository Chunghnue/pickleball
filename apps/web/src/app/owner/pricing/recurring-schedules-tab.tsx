"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dayLabel, formatMoney, formatShortDate, sessionPriceAfterDiscount } from "./pricing-format";
import { RecurringScheduleFormDialog } from "./recurring-schedule-form-dialog";
import type { CourtWithVenueName } from "../types";
import type { CreateRecurringScheduleResult, RecurringScheduleListItem } from "./types";

export function RecurringSchedulesTab({
  venueId,
  courtsInVenue,
  defaultCourtId,
  schedules,
  onCreated,
  onOpenDetail,
}: {
  venueId: string;
  courtsInVenue: CourtWithVenueName[];
  defaultCourtId: string | null;
  schedules: RecurringScheduleListItem[];
  onCreated: (result: CreateRecurringScheduleResult) => void;
  onOpenDetail: (scheduleId: string) => void;
}) {
  const courtNameById = new Map(courtsInVenue.map((court) => [court.id, court.name]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <RecurringScheduleFormDialog
          venueId={venueId}
          courtsInVenue={courtsInVenue}
          defaultCourtId={defaultCourtId}
          onCreated={onCreated}
          trigger={
            <Button type="button" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
              <Plus className="size-4" />
              Thêm lịch cố định
            </Button>
          }
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead>SÂN</TableHead>
                <TableHead>THỨ + KHUNG GIỜ</TableHead>
                <TableHead>GIÁ/BUỔI</TableHead>
                <TableHead>TỪ - ĐẾN</TableHead>
                <TableHead>SỐ BUỔI</TableHead>
                <TableHead>TRẠNG THÁI</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Chưa có lịch cố định – Khách đặt sân hàng tuần sẽ hiện ở đây
                  </TableCell>
                </TableRow>
              )}
              {schedules.map((schedule) => (
                <TableRow
                  key={schedule.id}
                  className="cursor-pointer"
                  onClick={() => onOpenDetail(schedule.id)}
                >
                  <TableCell className="font-medium">
                    {courtNameById.get(schedule.courtId) ?? "—"}
                  </TableCell>
                  <TableCell>
                    {dayLabel(schedule.dayOfWeek)}, {schedule.startTime} - {schedule.endTime}
                  </TableCell>
                  <TableCell className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatMoney(
                      sessionPriceAfterDiscount(schedule.pricePerSession, schedule.discountPercent),
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatShortDate(schedule.validFrom)} - {formatShortDate(schedule.validTo)}
                  </TableCell>
                  <TableCell>{schedule.occurrenceCount}</TableCell>
                  <TableCell>
                    <span
                      className={
                        schedule.status === "active"
                          ? "inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-600 dark:bg-green-950/40 dark:text-green-400"
                          : "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      }
                    >
                      {schedule.status === "active" ? "Đang áp dụng" : "Đã huỷ"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">Xem chi tiết →</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
