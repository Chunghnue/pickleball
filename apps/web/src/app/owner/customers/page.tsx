"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import { QuickBookDialog } from "@/app/owner/bookings/quick-book-dialog";
import type { Court } from "@/app/owner/types";
import { buildCustomersQuery } from "./customer-format";
import { CustomerMetrics } from "./customer-metrics";
import { CustomerFilters } from "./customer-filters";
import { CustomerTable } from "./customer-table";
import { AddCustomerDialog } from "./add-customer-dialog";
import { CustomerDetailDialog } from "./customer-detail-dialog";
import type {
  CustomerDetail,
  CustomerKind,
  CustomerListItem,
  CustomerListResponse,
  CustomerSummary,
  CustomerTier,
} from "./types";

const PAGE_SIZE = 20;

interface VenueOption {
  id: string;
  name: string;
}

interface BookingState {
  customer: CustomerDetail;
  venueId: string;
  courts: Court[];
}

export default function OwnerCustomersPage() {
  const router = useRouter();
  const { selectedVenueId } = useBranch();

  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [list, setList] = useState<CustomerListResponse | null>(null);
  const [tier, setTier] = useState<CustomerTier | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<{ kind: CustomerKind; id: string } | null>(null);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [booking, setBooking] = useState<BookingState | null>(null);

  const venueParam = selectedVenueId === ALL_BRANCHES_ID ? undefined : selectedVenueId;

  useEffect(() => {
    fetch("/api/venues/mine")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [tier, debouncedSearch, selectedVenueId]);

  const loadSummary = useCallback(() => {
    const qs = new URLSearchParams();
    if (venueParam) qs.set("venueId", venueParam);
    fetch(`/api/customers/summary${qs.toString() ? `?${qs}` : ""}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fcustomers");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => data && setSummary(data));
  }, [venueParam, router]);

  const loadList = useCallback(() => {
    const qs = buildCustomersQuery({
      venueId: venueParam,
      tier,
      search: debouncedSearch,
      page,
      pageSize: PAGE_SIZE,
    });
    fetch(`/api/customers?${qs}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fcustomers");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => data && setList(data));
  }, [venueParam, tier, debouncedSearch, page, router]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  function refreshAll() {
    loadSummary();
    loadList();
  }

  async function handleBookForCustomer(customer: CustomerDetail) {
    const venueId = venueParam ?? venues[0]?.id;
    if (!venueId) return;
    const courts = await fetch(`/api/venues/mine/${venueId}/courts`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => (Array.isArray(data) ? (data as Court[]) : []));
    setDetailTarget(null);
    setBooking({ customer, venueId, courts });
  }

  async function changeBookingVenue(venueId: string) {
    const courts = await fetch(`/api/venues/mine/${venueId}/courts`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => (Array.isArray(data) ? (data as Court[]) : []));
    setBooking((current) => (current ? { ...current, venueId, courts } : current));
  }

  const items: CustomerListItem[] = list?.items ?? [];
  const total = list?.total ?? 0;

  function todayString(): string {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${m}-${d}`;
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Khách hàng</h1>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="h-10 gap-2 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
        >
          <UserPlus className="size-4" />
          Thêm khách
        </Button>
      </div>

      {summary && <CustomerMetrics summary={summary} />}

      <CustomerFilters
        tier={tier}
        search={search}
        onTierChange={setTier}
        onSearchChange={setSearch}
      />

      <CustomerTable
        items={items}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onOpenDetail={(item) => setDetailTarget({ kind: item.kind, id: item.id })}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />

      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} onCreated={refreshAll} />

      <CustomerDetailDialog
        open={detailTarget !== null}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        target={detailTarget}
        onBookForCustomer={handleBookForCustomer}
      />

      <QuickBookDialog
        open={booking !== null}
        onOpenChange={(open) => !open && setBooking(null)}
        venueId={booking?.venueId ?? ""}
        date={todayString()}
        courts={booking?.courts ?? []}
        editableDate
        venues={venues}
        onVenueChange={changeBookingVenue}
        prefillCustomer={
          booking
            ? {
                kind: booking.customer.kind,
                id: booking.customer.id,
                fullName: booking.customer.fullName,
                phone: booking.customer.phone ?? "",
              }
            : undefined
        }
        onCreated={() => {
          setBooking(null);
          refreshAll();
        }}
      />
    </main>
  );
}
