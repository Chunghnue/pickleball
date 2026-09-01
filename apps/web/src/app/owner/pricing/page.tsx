"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import { PricingMetrics } from "./pricing-metrics";
import { PricingRulesTab } from "./pricing-rules-tab";
import { RecurringSchedulesTab } from "./recurring-schedules-tab";
import { RecurringScheduleDetailDialog } from "./recurring-schedule-detail-dialog";
import type { CourtWithVenueName, Venue } from "../types";
import type {
  PricingRule,
  PricingSummary,
  RecurringScheduleListItem,
} from "./types";

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
          <h1 className="text-2xl font-bold">Bảng giá</h1>
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

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div>
        <h1 className="text-2xl font-bold">Bảng giá</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý giá thuê sân theo khung giờ và các lịch đặt cố định.
        </p>
      </div>

      {summary && <PricingMetrics summary={summary} />}

      <div className="flex gap-1.5">
        {(
          [
            { value: "pricing", label: "Bảng giá" },
            { value: "recurring", label: "Đặt cố định" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={
              activeTab === tab.value
                ? "inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"
                : "inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "pricing" &&
        (selectedCourtId && rules ? (
          <PricingRulesTab
            venueId={resolvedVenueId}
            courtsInVenue={courtsInVenue}
            selectedCourtId={selectedCourtId}
            onCourtChange={setSelectedCourtId}
            rules={rules}
            copySourceCandidates={copySourceCandidates}
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
            onCopied={() => {
              loadRules();
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
