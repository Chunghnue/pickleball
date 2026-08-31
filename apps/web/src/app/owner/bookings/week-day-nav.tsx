"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WeekDayNavProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  courtCount: number;
}

function parseDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday;
}

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const LEGEND: { label: string; className: string }[] = [
  { label: "Trống", className: "bg-green-200 dark:bg-green-900" },
  { label: "Đã đặt", className: "bg-rose-200 dark:bg-rose-900" },
  { label: "Đang chơi", className: "bg-blue-200 dark:bg-blue-900" },
  { label: "Cố định", className: "bg-purple-200 dark:bg-purple-900" },
];

export function WeekDayNav({ selectedDate, onSelectDate, courtCount }: WeekDayNavProps) {
  const [sportTab, setSportTab] = useState<"all" | "pickleball">("all");
  const selected = parseDate(selectedDate);
  const monday = startOfWeek(selected);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const today = formatDate(new Date());

  function shiftWeek(deltaDays: number) {
    const next = new Date(selected);
    next.setDate(selected.getDate() + deltaDays);
    onSelectDate(formatDate(next));
  }

  const first = days[0];
  const last = days[6];
  const title = `Tuần ${first.getDate()}/${first.getMonth() + 1} – ${last.getDate()}/${last.getMonth() + 1}`;

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => shiftWeek(-7)}
            aria-label="Tuần trước"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            onClick={() => onSelectDate(today)}
          >
            <CalendarDays className="size-4" />
            Hôm nay
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => shiftWeek(7)}
            aria-label="Tuần sau"
          >
            <ChevronRight className="size-4" />
          </Button>
          <span className="ml-1 text-sm font-semibold">{title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {LEGEND.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span className={`size-3 rounded-sm ${item.className}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {days.map((d, i) => {
          const value = formatDate(d);
          const isSelected = value === selectedDate;
          const isToday = value === today;
          const showMonth = i === 0 || d.getMonth() !== days[i - 1].getMonth();
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelectDate(value)}
              className={`flex min-w-16 flex-col items-center rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                isSelected
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "bg-background hover:bg-muted"
              }`}
            >
              <span className={isSelected ? "text-blue-100" : "text-muted-foreground"}>
                {DAY_LABELS[i]}
                {showMonth && <sup className="ml-0.5">{d.getMonth() + 1}</sup>}
              </span>
              <span className="flex items-center gap-1 text-lg font-bold">
                {d.getDate()}
                {isToday && (
                  <span
                    className={`size-1.5 rounded-full ${isSelected ? "bg-white" : "bg-blue-500"}`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSportTab("all")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            sportTab === "all"
              ? "bg-blue-600 text-white"
              : "border bg-background text-foreground hover:bg-muted"
          }`}
        >
          Tất cả ({courtCount})
        </button>
        <button
          type="button"
          onClick={() => setSportTab("pickleball")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            sportTab === "pickleball"
              ? "bg-blue-600 text-white"
              : "border bg-background text-foreground hover:bg-muted"
          }`}
        >
          🏓 Pickleball ({courtCount})
        </button>
      </div>
    </div>
  );
}
