import { Card, CardContent } from "@/components/ui/card";
import { CourtActions } from "./court-actions";
import type { Court, CourtWithVenueName } from "./types";

const STATUS_LABEL: Record<Court["status"], string> = {
  active: "Hoạt động",
  maintenance: "Bảo trì",
  closed: "Tạm đóng",
};

const STATUS_CLASS: Record<Court["status"], string> = {
  active: "bg-green-600 text-white",
  maintenance: "bg-amber-500 text-white",
  closed: "bg-red-600 text-white",
};

interface VenueOption {
  id: string;
  name: string;
}

interface CourtGridProps {
  courts: (Court | CourtWithVenueName)[];
  venues: VenueOption[];
  showVenueBadge: boolean;
  onUpdated: (court: Court) => void;
  onDeleted: (courtId: string) => void;
}

export function CourtGrid({
  courts,
  venues,
  showVenueBadge,
  onUpdated,
  onDeleted,
}: CourtGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courts.map((court) => (
        <Card key={court.id}>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{court.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[court.status]}`}
              >
                {STATUS_LABEL[court.status]}
              </span>
            </div>
            {showVenueBadge && "venueName" in court && (
              <span className="text-xs text-muted-foreground">{court.venueName}</span>
            )}
            <span className="text-sm text-muted-foreground">
              Sức chứa: {court.capacity ?? "—"}
            </span>
            {court.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {court.description}
              </p>
            )}
            <div className="pt-2">
              <CourtActions
                court={court}
                venues={venues}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
