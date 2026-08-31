"use client";

interface WeekDayNavProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
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

export function WeekDayNav({ selectedDate, onSelectDate }: WeekDayNavProps) {
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => shiftWeek(-7)}
          className="rounded-lg border px-2 py-1 text-sm"
          aria-label="Tuần trước"
        >
          ←
        </button>
        <span className="text-sm font-medium">{title}</span>
        <button
          type="button"
          onClick={() => shiftWeek(7)}
          className="rounded-lg border px-2 py-1 text-sm"
          aria-label="Tuần sau"
        >
          →
        </button>
        <button
          type="button"
          onClick={() => onSelectDate(today)}
          className="ml-2 rounded-lg border px-2 py-1 text-sm"
        >
          Hôm nay
        </button>
      </div>
      <div className="flex gap-2">
        {days.map((d, i) => {
          const value = formatDate(d);
          const isSelected = value === selectedDate;
          const isToday = value === today;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelectDate(value)}
              className={`flex flex-col items-center rounded-lg border px-3 py-1.5 text-sm ${
                isSelected ? "bg-blue-600 text-white" : "bg-transparent"
              }`}
            >
              <span>{DAY_LABELS[i]}</span>
              <span className="flex items-center gap-1">
                {d.getDate()}
                {isToday && <span className="size-1.5 rounded-full bg-blue-500" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
