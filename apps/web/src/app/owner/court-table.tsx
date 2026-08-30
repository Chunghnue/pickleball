import { CheckCircle2, Lock, Users, Volleyball, Wrench } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CourtActions } from "./court-actions";
import type { Court, CourtWithVenueName } from "./types";

const STATUS_LABEL: Record<Court["status"], string> = {
  active: "Hoạt động",
  maintenance: "Bảo trì",
  closed: "Tạm đóng",
};

const STATUS_ICON: Record<Court["status"], typeof CheckCircle2> = {
  active: CheckCircle2,
  maintenance: Wrench,
  closed: Lock,
};

const STATUS_BADGE_CLASS: Record<Court["status"], string> = {
  active: "bg-green-600 text-white",
  maintenance: "bg-amber-500 text-white",
  closed: "bg-red-600 text-white",
};

interface VenueOption {
  id: string;
  name: string;
}

interface CourtTableProps {
  courts: (Court | CourtWithVenueName)[];
  venues: VenueOption[];
  showVenueColumn: boolean;
  onUpdated: (court: Court) => void;
  onDeleted: (courtId: string) => void;
}

export function CourtTable({
  courts,
  venues,
  showVenueColumn,
  onUpdated,
  onDeleted,
}: CourtTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/60 hover:bg-muted/60">
          <TableHead className="w-10"></TableHead>
          <TableHead>Sân</TableHead>
          {showVenueColumn && <TableHead>Chi nhánh</TableHead>}
          <TableHead>Loại</TableHead>
          <TableHead>Sức chứa</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Thao tác</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courts.map((court, index) => {
          const StatusIcon = STATUS_ICON[court.status];
          return (
            <TableRow key={court.id}>
              <TableCell className="text-muted-foreground">{index + 1}</TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-green-50 text-pink-500 dark:bg-green-950/40">
                    <Volleyball className="size-5" />
                  </span>
                  <div>
                    <p className="font-medium">{court.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {court.description || "Chưa có mô tả"}
                    </p>
                  </div>
                </div>
              </TableCell>
              {showVenueColumn && (
                <TableCell>
                  {"venueName" in court ? court.venueName : ""}
                </TableCell>
              )}
              <TableCell>
                <span className="flex items-center gap-1.5 text-sm">
                  <Volleyball className="size-3.5 text-pink-500" />
                  Pickleball
                </span>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5 text-sm">
                  <Users className="size-3.5 text-muted-foreground" />
                  {court.capacity ?? "—"} người
                </span>
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[court.status]}`}
                >
                  <StatusIcon className="size-3" />
                  {STATUS_LABEL[court.status]}
                </span>
              </TableCell>
              <TableCell>
                <CourtActions
                  court={court}
                  venues={venues}
                  onUpdated={onUpdated}
                  onDeleted={onDeleted}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
