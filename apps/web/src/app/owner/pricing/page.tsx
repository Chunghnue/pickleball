"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Repeat, Tag } from "lucide-react";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PricingMetrics } from "./pricing-metrics";
import { PricingRulesTab } from "./pricing-rules-tab";
import { PricingRuleFormDialog } from "./pricing-rule-form-dialog";
import { CopyPricingDialog } from "./copy-pricing-dialog";
import { RecurringSchedulesTab } from "./recurring-schedules-tab";
import { RecurringScheduleDetailDialog } from "./recurring-schedule-detail-dialog";
import type { CourtWithVenueName, Venue } from "../types";
import type {
  PricingRule,
  PricingSummary,
  RecurringScheduleListItem,
} from "./types";

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export default function OwnerPricingPage() {
  const router = useRouter();
  const { selectedVenueId, setSelectedVenueId } = useBranch();

  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [allCourts, setAllCourts] = useState<CourtWithVenueName[] | null>(null);
  const [courtIdParam, setCourtIdParam] = useState<string | null>(null);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pricing" | "recurring">("pricing");
  const [summary, setSummary] = useState<PricingSummary | null>(null);
  const [rules, setRules] = useState<PricingRule[] | null>(null);
  const [schedules, setSchedules] = useState<RecurringScheduleListItem[] | null>(null);
  const [detailScheduleId, setDetailScheduleId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCourtIdParam(params.get("courtId"));
  }, []);

  // Load the owner's venues — used to fall back to one, *for this page
  // only*, when the global branch switcher is at "Tất cả chi nhánh" (every
  // pricing/recurring-schedule API needs a concrete venueId). Matches how
  // the Bookings page resolves the same situation: read from the switcher,
  // but never write the fallback back into it — only an explicit ?courtId=
  // navigation (below) is deliberate enough to sync the global switcher.
  useEffect(() => {
    fetch("/api/venues/mine")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setVenues(data));
  }, []);

  // Load every court the owner has, across all venues — used to resolve
  // ?courtId= to a venue, populate the per-venue court dropdown, and list
  // copy-from candidates.
  useEffect(() => {
    fetch("/api/venues/mine/courts")
      .then((res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fpricing");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => data && setAllCourts(data));
  }, [router]);

  // Resolve venue from ?courtId= once courts are loaded, syncing the global
  // branch switcher so the rest of the app stays consistent.
  useEffect(() => {
    if (!courtIdParam || !allCourts) return;
    const court = allCourts.find((c) => c.id === courtIdParam);
    if (!court) return;
    setSelectedVenueId(court.venueId);
    setSelectedCourtId(courtIdParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCourts, courtIdParam]);

  // Page-local fallback only — deliberately does NOT call
  // setSelectedVenueId, so landing here with no branch chosen doesn't
  // silently reassign the global "CHI NHÁNH" dropdown for the rest of the
  // app (that dropdown should only ever change from the user picking it,
  // or from the explicit ?courtId= navigation above).
  const resolvedVenueId =
    selectedVenueId !== ALL_BRANCHES_ID
      ? selectedVenueId
      : (venues && venues.length > 0 ? venues[0].id : null);

  const courtsInVenue = useMemo(
    () =>
      (allCourts ?? [])
        .filter((court) => court.venueId === resolvedVenueId)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [allCourts, resolvedVenueId],
  );

  const copySourceCandidates = useMemo(
    () => (allCourts ?? []).filter((court) => court.id !== selectedCourtId),
    [allCourts, selectedCourtId],
  );

  // Keep selectedCourtId valid for the resolved venue; default to the first
  // court when nothing (or a stale/foreign court) is selected.
  useEffect(() => {
    if (courtsInVenue.length === 0) {
      setSelectedCourtId(null);
      return;
    }
    if (!selectedCourtId || !courtsInVenue.some((c) => c.id === selectedCourtId)) {
      setSelectedCourtId(courtsInVenue[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtsInVenue]);

  const loadSummary = useCallback(() => {
    if (!resolvedVenueId) {
      setSummary(null);
      return;
    }
    fetch(`/api/venues/mine/${resolvedVenueId}/pricing-summary`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSummary(data));
  }, [resolvedVenueId]);

  const loadRules = useCallback(() => {
    if (!resolvedVenueId || !selectedCourtId) {
      setRules(null);
      return;
    }
    fetch(`/api/venues/mine/${resolvedVenueId}/courts/${selectedCourtId}/pricing-rules`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setRules(data ?? []));
  }, [resolvedVenueId, selectedCourtId]);

  const loadSchedules = useCallback(() => {
    if (!resolvedVenueId) {
      setSchedules(null);
      return;
    }
    fetch(`/api/venues/mine/${resolvedVenueId}/recurring-schedules`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSchedules(data ?? []));
  }, [resolvedVenueId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  if (!resolvedVenueId) {
    if (venues && venues.length === 0) {
      return (
        <main className="flex w-full flex-1 flex-col items-center justify-center gap-2 bg-muted/30 p-8 text-center">
          <h1 className="text-2xl font-bold">Bảng giá dịch vụ</h1>
          <p className="text-muted-foreground">Bạn chưa có chi nhánh nào.</p>
        </main>
      );
    }
    return (
      <main className="flex w-full flex-1 flex-col items-center justify-center gap-2 bg-muted/30 p-8 text-center">
        <p className="text-muted-foreground">Đang tải...</p>
      </main>
    );
  }

  const TABS = [
    { value: "pricing" as const, label: "Bảng giá", icon: Tag, count: rules?.length ?? 0 },
    {
      value: "recurring" as const,
      label: "Đặt cố định",
      icon: Repeat,
      count: schedules?.length ?? 0,
    },
  ];

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bảng giá dịch vụ</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý giá theo khung giờ và lịch đặt cố định
          </p>
        </div>

        {activeTab === "pricing" && selectedCourtId && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCourtId}
              onChange={(e) => setSelectedCourtId(e.target.value)}
              className={SELECT_CLASS}
            >
              {courtsInVenue.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
            <CopyPricingDialog
              venueId={resolvedVenueId}
              targetCourtId={selectedCourtId}
              sourceCandidates={copySourceCandidates}
              onCopied={() => {
                loadRules();
                loadSummary();
              }}
              trigger={
                <Button type="button" variant="outline" className="gap-1.5">
                  <Copy className="size-4" />
                  Sao chép
                </Button>
              }
            />
            <PricingRuleFormDialog
              mode="create"
              venueId={resolvedVenueId}
              courtId={selectedCourtId}
              onSaved={(saved) => {
                setRules((prev) => [...(prev ?? []), saved]);
                loadSummary();
              }}
              trigger={
                <Button type="button" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
                  <Plus className="size-4" />
                  Thêm bảng giá
                </Button>
              }
            />
          </div>
        )}
      </div>

      {summary && <PricingMetrics summary={summary} />}

      <div className="border-b">
        <div className="flex gap-6">
          {TABS.map((tab) => {
            const active = activeTab === tab.value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium",
                  active
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {tab.label}
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs font-semibold",
                    active ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "pricing" &&
        (selectedCourtId && rules ? (
          <PricingRulesTab
            venueId={resolvedVenueId}
            courtId={selectedCourtId}
            rules={rules}
            onRuleSaved={(saved) => {
              setRules((prev) => {
                const existing = prev ?? [];
                const index = existing.findIndex((r) => r.id === saved.id);
                if (index === -1) return [...existing, saved];
                const next = [...existing];
                next[index] = saved;
                return next;
              });
              loadSummary();
            }}
            onRuleDeleted={(ruleId) => {
              setRules((prev) => (prev ?? []).filter((r) => r.id !== ruleId));
              loadSummary();
            }}
          />
        ) : (
          <p className="text-center text-muted-foreground">
            Chi nhánh này chưa có sân nào để cấu hình bảng giá.
          </p>
        ))}

      {activeTab === "recurring" && schedules && (
        <RecurringSchedulesTab
          venueId={resolvedVenueId}
          courtsInVenue={courtsInVenue}
          defaultCourtId={selectedCourtId}
          schedules={schedules}
          onCreated={() => {
            loadSchedules();
            loadSummary();
          }}
          onOpenDetail={setDetailScheduleId}
        />
      )}

      <RecurringScheduleDetailDialog
        open={detailScheduleId !== null}
        onOpenChange={(open) => !open && setDetailScheduleId(null)}
        venueId={resolvedVenueId}
        scheduleId={detailScheduleId}
        onCancelled={() => {
          loadSchedules();
          loadSummary();
        }}
      />
    </main>
  );
}
