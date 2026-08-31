"use client";

import { CheckCircle2, ClipboardList, Circle } from "lucide-react";

interface StatusBarProps {
  bookedCount: number;
  emptyCount: number;
  playingCount: number;
  totalCount: number;
}

function Pill({
  icon: Icon,
  iconClassName,
  children,
}: {
  icon: typeof ClipboardList;
  iconClassName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm">
      <Icon className={`size-4 ${iconClassName}`} />
      <span>{children}</span>
    </div>
  );
}

export function StatusBar({ bookedCount, emptyCount, playingCount, totalCount }: StatusBarProps) {
  const fillRate =
    totalCount > 0 ? Math.round(((bookedCount + playingCount) / totalCount) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Pill icon={ClipboardList} iconClassName="text-muted-foreground">
        <b className="font-semibold">{bookedCount}</b> đã đặt
      </Pill>
      <Pill icon={CheckCircle2} iconClassName="text-green-600">
        <b className="font-semibold">{emptyCount}</b> trống
      </Pill>
      <Pill icon={Circle} iconClassName="text-purple-600">
        <b className="font-semibold">{playingCount}</b> đang chơi
      </Pill>
      <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2 text-sm">
        <span className="text-muted-foreground">Lấp đầy</span>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${fillRate}%` }}
          />
        </div>
        <span className="font-semibold">{fillRate}%</span>
      </div>
    </div>
  );
}
