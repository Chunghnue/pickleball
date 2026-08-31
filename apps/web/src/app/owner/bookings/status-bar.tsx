"use client";

import { Button } from "@/components/ui/button";

interface StatusBarProps {
  bookedCount: number;
  emptyCount: number;
  playingCount: number;
  totalCount: number;
  onRefresh: () => void;
  onQuickBook: () => void;
}

export function StatusBar({
  bookedCount,
  emptyCount,
  playingCount,
  totalCount,
  onRefresh,
  onQuickBook,
}: StatusBarProps) {
  const fillRate =
    totalCount > 0 ? Math.round(((bookedCount + playingCount) / totalCount) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <p className="text-muted-foreground">Đã đặt</p>
          <p className="text-lg font-semibold">{bookedCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Trống</p>
          <p className="text-lg font-semibold">{emptyCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Đang chơi</p>
          <p className="text-lg font-semibold">{playingCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Lấp đầy</p>
          <p className="text-lg font-semibold">{fillRate}%</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onRefresh}>
          Làm mới
        </Button>
        <Button type="button" onClick={onQuickBook}>
          ⚡ Đặt nhanh
        </Button>
      </div>
    </div>
  );
}
