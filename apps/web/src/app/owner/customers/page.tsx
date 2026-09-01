"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
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

  const venueParam = selectedVenueId === ALL_BRANCHES_ID ? undefined : selectedVenueId;

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

  function handleBookForCustomer(customer: CustomerDetail) {
    router.push(`/owner/bookings?bookForKind=${customer.kind}&bookForId=${customer.id}`);
  }

  const items: CustomerListItem[] = list?.items ?? [];
  const total = list?.total ?? 0;

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Khách hàng</h1>
          {summary && (
            <p className="text-sm text-muted-foreground">
              Tổng {summary.totalCustomers} khách ·{" "}
              <span className="font-medium text-amber-500">{summary.vipCustomers} VIP</span>
            </p>
          )}
        </div>
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
    </main>
  );
}
