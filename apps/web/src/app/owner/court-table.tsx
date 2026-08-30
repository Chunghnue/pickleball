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

const STATUS_CLASS: Record<Court["status"], string> = {
  active: "text-emerald-600",
  maintenance: "text-amber-600",
  closed: "text-muted-foreground",
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
        <TableRow>
          <TableHead>Sân</TableHead>
          {showVenueColumn && <TableHead>Chi nhánh</TableHead>}
          <TableHead>Sức chứa</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Thao tác</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courts.map((court) => (
          <TableRow key={court.id}>
            <TableCell className="font-medium">{court.name}</TableCell>
            {showVenueColumn && (
              <TableCell>
                {"venueName" in court ? court.venueName : ""}
              </TableCell>
            )}
            <TableCell>{court.capacity ?? "—"}</TableCell>
            <TableCell className={STATUS_CLASS[court.status]}>
              {STATUS_LABEL[court.status]}
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
        ))}
      </TableBody>
    </Table>
  );
}
