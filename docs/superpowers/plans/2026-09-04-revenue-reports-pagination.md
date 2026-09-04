# Revenue Reports Transactions Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pagination to the transactions list in `GET /reports/revenue` and the `/owner/revenue` table, reversing the "no pagination" MVP decision now that the list can get long in practice.

**Architecture:** Reuse the exact pagination pattern already shipped for Customers (`apps/api/src/customers/customers.service.ts` + `apps/web/src/app/owner/customers/customer-table.tsx`) — `page`/`pageSize` query params (parsed as strings, clamped in the service), `.skip()/.take()` on the existing query builder, and a `total` count. The CSV export endpoint is untouched — it stays a full, unpaginated dump by design (backend spec §0.1).

**Tech Stack:** NestJS/TypeORM (backend), Next.js/React (frontend) — same stack as the rest of the module, no new dependencies.

## Global Constraints

- Source of truth: [docs/superpowers/specs/2026-08-26-revenue-reports-design.md](../specs/2026-08-26-revenue-reports-design.md) §0.1 and [docs/superpowers/specs/2026-09-03-revenue-reports-frontend-design.md](../specs/2026-09-03-revenue-reports-frontend-design.md) §2.2.
- `transactionsTotal` **reuses** `currentPeriod.transactionCount` — both are "count of paid payments in range for these courts," so do not add a second `COUNT(*)` query.
- Default `pageSize` is 20, max 100, matching `ListCustomersDto`/`CustomersService`'s `clampPage`/`clampPageSize` exactly (copy the pattern, don't import it — `customers.service.ts` keeps its own private copy too, this module does the same).
- `GET /reports/revenue/export` is **not** touched — no `page`/`pageSize` params, `fetchTransactions` continues to return everything when called without pagination args.
- All backend commands assume `apps/api/` as the working directory; all frontend commands assume `apps/web/`.

---

## File Structure

```
apps/api/src/reports/dto/get-revenue-report.dto.ts   (MODIFY — add page/pageSize)
apps/api/src/reports/reports.service.ts              (MODIFY — paginate fetchTransactions for the JSON endpoint)
apps/api/test/reports-revenue.e2e-spec.ts             (MODIFY — extend existing test + add pagination tests)
apps/web/src/app/owner/revenue/types.ts                (MODIFY — add transactionsPage/PageSize/Total)
apps/web/src/app/owner/revenue/revenue-format.ts        (MODIFY — buildRevenueQuery accepts page/pageSize)
apps/web/src/app/owner/revenue/revenue-format.test.ts    (MODIFY — new buildRevenueQuery cases)
apps/web/src/app/owner/revenue/revenue-transactions-table.tsx (MODIFY — pager footer)
apps/web/src/app/owner/revenue/page.tsx                 (MODIFY — page state, reset on filter/venue change)
```

---

### Task 1: Backend — paginate `GET /reports/revenue`

**Files:**
- Modify: `apps/api/src/reports/dto/get-revenue-report.dto.ts`
- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/test/reports-revenue.e2e-spec.ts`

**Interfaces:**
- Produces: `GetRevenueReportDto.page?: string`, `.pageSize?: string`; `RevenueReport` gains `transactionsPage: number`, `transactionsPageSize: number`, `transactionsTotal: number` (consumed by Task 2's frontend).

- [ ] **Step 1: Add `page`/`pageSize` to the DTO**

In `apps/api/src/reports/dto/get-revenue-report.dto.ts`, add below the existing `to` field:

```ts
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
```

- [ ] **Step 2: Write the failing e2e test for pagination**

Add this new `describe` block to `apps/api/test/reports-revenue.e2e-spec.ts`, right before the closing `});` of the outer `describe('Owner revenue report (e2e)', ...)` block (after the existing `describe('GET /reports/revenue/export', ...)` block):

```ts
  describe('pagination', () => {
    async function seedManyTransactions(
      ownerId: string,
      courtId: string,
      contactId: string,
      count: number,
    ): Promise<void> {
      for (let i = 0; i < count; i++) {
        const booking = await createBooking(courtId, 100000 + i * 1000, '2026-08-05', {
          customerContactId: contactId,
        });
        await payBooking(booking.id, new Date(2026, 7, 5, 8, i, 0));
      }
    }

    it('defaults to page 1 / pageSize 20 and reuses transactionCount as the total', async () => {
      const owner = await createUser('owner1@test.com', UserRole.OWNER);
      const venue = await createVenue(owner.id, 'My Venue');
      const court = await createCourt(venue.id, 'Court 1');
      const contact = await createContact(owner.id, 'Khách Page', '0933000000');
      await seedManyTransactions(owner.id, court.id, contact.id, 25);

      const token = await loginAs('owner1@test.com');
      const response = await request(app.getHttpServer())
        .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.transactionsPage).toBe(1);
      expect(response.body.transactionsPageSize).toBe(20);
      expect(response.body.transactionsTotal).toBe(25);
      expect(response.body.transactionsTotal).toBe(response.body.currentPeriod.transactionCount);
      expect(response.body.transactions).toHaveLength(20);
    });

    it('returns the second page, still ordered by paidAt descending across pages', async () => {
      const owner = await createUser('owner1@test.com', UserRole.OWNER);
      const venue = await createVenue(owner.id, 'My Venue');
      const court = await createCourt(venue.id, 'Court 1');
      const contact = await createContact(owner.id, 'Khách Page', '0933000000');
      await seedManyTransactions(owner.id, court.id, contact.id, 25);

      const token = await loginAs('owner1@test.com');
      const page1 = await request(app.getHttpServer())
        .get('/reports/revenue?from=2026-08-01&to=2026-08-10&page=1&pageSize=20')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const page2 = await request(app.getHttpServer())
        .get('/reports/revenue?from=2026-08-01&to=2026-08-10&page=2&pageSize=20')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(page2.body.transactionsPage).toBe(2);
      expect(page2.body.transactions).toHaveLength(5);
      expect(page2.body.transactionsTotal).toBe(25);

      const page1Ids = new Set(page1.body.transactions.map((t: { id: string }) => t.id));
      const page2Ids = new Set(page2.body.transactions.map((t: { id: string }) => t.id));
      expect([...page1Ids].some((id) => page2Ids.has(id))).toBe(false);

      const lastOfPage1 = page1.body.transactions[19].paidAt;
      const firstOfPage2 = page2.body.transactions[0].paidAt;
      expect(new Date(firstOfPage2).getTime()).toBeLessThanOrEqual(new Date(lastOfPage1).getTime());
    });

    it('clamps an out-of-range pageSize to 100 and an invalid page to 1', async () => {
      const owner = await createUser('owner1@test.com', UserRole.OWNER);
      const venue = await createVenue(owner.id, 'My Venue');
      const court = await createCourt(venue.id, 'Court 1');
      const contact = await createContact(owner.id, 'Khách Page', '0933000000');
      await seedManyTransactions(owner.id, court.id, contact.id, 3);

      const token = await loginAs('owner1@test.com');
      const response = await request(app.getHttpServer())
        .get('/reports/revenue?from=2026-08-01&to=2026-08-10&page=0&pageSize=99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.transactionsPage).toBe(1);
      expect(response.body.transactionsPageSize).toBe(100);
      expect(response.body.transactions).toHaveLength(3);
    });
  });
```

Also update the existing big aggregation test (`'aggregates current vs previous period, ...'`) — add these 3 assertions right after the existing `expect(response.body.transactions).toHaveLength(3);` line:

```ts
    expect(response.body.transactionsPage).toBe(1);
    expect(response.body.transactionsPageSize).toBe(20);
    expect(response.body.transactionsTotal).toBe(3);
```

- [ ] **Step 3: Run the e2e suite to verify the new tests fail**

Run: `cd apps/api && npm run test:e2e -- reports-revenue.e2e-spec.ts`
Expected: FAIL — `response.body.transactionsPage` is `undefined`, `toHaveLength(20)` fails because today `transactions` returns all 25 rows unpaginated.

- [ ] **Step 4: Implement pagination in the service**

In `apps/api/src/reports/reports.service.ts`:

Add these two helpers right after the imports (same pattern as `apps/api/src/customers/customers.service.ts`):

```ts
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function clampPage(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clampPageSize(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}
```

Update the `RevenueReport` interface to add the 3 new fields after `transactions`:

```ts
export interface RevenueReport {
  currentPeriod: { revenue: number; transactionCount: number; avgPerTransaction: number };
  previousPeriod: { revenue: number };
  changeAmount: number;
  changePercent: number | null;
  revenueByDay: { date: string; revenue: number }[];
  transactions: RevenueReportTransaction[];
  transactionsPage: number;
  transactionsPageSize: number;
  transactionsTotal: number;
}
```

Change `fetchTransactions`'s signature to take an optional pagination argument, applying `.skip()/.take()` only when it's provided (the CSV export path keeps calling it with no 4th argument, so it stays unpaginated):

```ts
  private fetchTransactions(
    courtIds: string[],
    start: Date,
    end: Date,
    pagination?: { skip: number; take: number },
  ): Promise<TransactionRow[]> {
    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
      .leftJoin('users', 'customer', 'customer.id::text = booking.customer_id')
      .leftJoin('customer_contacts', 'contact', 'contact.id = booking.customer_contact_id')
      .select('payment.id', 'id')
      .addSelect('payment.paid_at', 'paidAt')
      .addSelect('booking.total_price', 'amount')
      .addSelect('COALESCE(customer.full_name, contact.full_name)', 'customerName')
      .addSelect('COALESCE(customer.phone, contact.phone)', 'customerPhone')
      .where('booking.court_id IN (:...courtIds)', { courtIds })
      .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
      .andWhere('payment.paid_at >= :start', { start })
      .andWhere('payment.paid_at < :end', { end })
      .orderBy('payment.paid_at', 'DESC');
    if (pagination) {
      qb.skip(pagination.skip).take(pagination.take);
    }
    return qb.getRawMany<TransactionRow>();
  }
```

In `getRevenueReport`, compute `page`/`pageSize` right after `this.assertValidRange(dto)` and pass pagination into the `fetchTransactions` call inside `Promise.all`:

```ts
  async getRevenueReport(ownerId: string, dto: GetRevenueReportDto): Promise<RevenueReport> {
    this.assertValidRange(dto);
    const page = clampPage(dto.page);
    const pageSize = clampPageSize(dto.pageSize);
    const courtIds = await this.resolveCourtIds(ownerId, dto.venueId);
    const days = getDaysBetween(dto.from, dto.to);

    if (courtIds.length === 0) {
      return this.emptyReport(days, page, pageSize);
    }

    const { start, end } = parseDateRangeBoundaries(dto.from, dto.to);
    const previousPeriod = getPreviousPeriodRange(dto.from, dto.to);
    const { start: prevStart, end: prevEnd } = parseDateRangeBoundaries(
      previousPeriod.from,
      previousPeriod.to,
    );

    const [currentAggregate, previousAggregate, revenueByDayRows, transactionRows] =
      await Promise.all([
        this.aggregatePeriod(courtIds, start, end),
        this.aggregatePeriod(courtIds, prevStart, prevEnd),
        this.paymentsRepository
          .createQueryBuilder('payment')
          .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
          .select("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')", 'date')
          .addSelect('SUM(booking.total_price)', 'revenue')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
          .andWhere('payment.paid_at >= :start', { start })
          .andWhere('payment.paid_at < :end', { end })
          .groupBy("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')")
          .getRawMany<{ date: string; revenue: string }>(),
        this.fetchTransactions(courtIds, start, end, { skip: (page - 1) * pageSize, take: pageSize }),
      ]);

    const currentRevenue = Number(currentAggregate.revenue ?? 0);
    const currentCount = Number(currentAggregate.count);
    const previousRevenue = Number(previousAggregate.revenue ?? 0);

    const transactions: RevenueReportTransaction[] = transactionRows.map((row) => ({
      id: row.id,
      transactionCode: buildTransactionCode(row.id),
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      paidAt: row.paidAt.toISOString(),
      amount: Number(row.amount),
      status: 'paid',
    }));

    return {
      currentPeriod: {
        revenue: currentRevenue,
        transactionCount: currentCount,
        avgPerTransaction: computeAvgPerTransaction(currentRevenue, currentCount),
      },
      previousPeriod: { revenue: previousRevenue },
      changeAmount: currentRevenue - previousRevenue,
      changePercent: computeChangePercent(currentRevenue, previousRevenue),
      revenueByDay: fillRevenueByDay(revenueByDayRows, days),
      transactions,
      transactionsPage: page,
      transactionsPageSize: pageSize,
      transactionsTotal: currentCount,
    };
  }
```

Update `emptyReport` to accept and echo back `page`/`pageSize`:

```ts
  private emptyReport(days: string[], page: number, pageSize: number): RevenueReport {
    return {
      currentPeriod: { revenue: 0, transactionCount: 0, avgPerTransaction: 0 },
      previousPeriod: { revenue: 0 },
      changeAmount: 0,
      changePercent: null,
      revenueByDay: days.map((date) => ({ date, revenue: 0 })),
      transactions: [],
      transactionsPage: page,
      transactionsPageSize: pageSize,
      transactionsTotal: 0,
    };
  }
```

`getRevenueReportCsv` is unchanged — it still calls `this.fetchTransactions(courtIds, start, end)` with no 4th argument, so `pagination` is `undefined` and the CSV keeps exporting everything.

- [ ] **Step 5: Run the e2e suite to verify it passes**

Run: `cd apps/api && npm run test:e2e -- reports-revenue.e2e-spec.ts`
Expected: PASS, all suites in the file including the 3 new pagination tests and the updated aggregation test.

- [ ] **Step 6: Run the full e2e and unit suites to confirm no regressions**

Run: `cd apps/api && npm run test:e2e`
Expected: PASS, all 36+ suites.

Run: `cd apps/api && npm test`
Expected: PASS, all suites (no unit tests changed, this just confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/dto/get-revenue-report.dto.ts apps/api/src/reports/reports.service.ts apps/api/test/reports-revenue.e2e-spec.ts
git commit -m "feat(api): paginate GET /reports/revenue transactions"
```

---

### Task 2: Frontend — pager UI on the transactions table

**Files:**
- Modify: `apps/web/src/app/owner/revenue/types.ts`
- Modify: `apps/web/src/app/owner/revenue/revenue-format.ts`
- Modify: `apps/web/src/app/owner/revenue/revenue-format.test.ts`
- Modify: `apps/web/src/app/owner/revenue/revenue-transactions-table.tsx`
- Modify: `apps/web/src/app/owner/revenue/page.tsx`

**Interfaces:**
- Consumes: Task 1's `transactionsPage`/`transactionsPageSize`/`transactionsTotal` fields.
- Produces: the finished paginated table — leaf of this plan.

- [ ] **Step 1: Write the failing `buildRevenueQuery` tests**

Add to `apps/web/src/app/owner/revenue/revenue-format.test.ts`, inside the existing `describe("buildRevenueQuery", ...)` block (after the last `it`):

```ts
  it("includes page and pageSize when provided", () => {
    expect(
      buildRevenueQuery({ from: "2026-08-01", to: "2026-08-30", page: 2, pageSize: 20 }),
    ).toBe("from=2026-08-01&to=2026-08-30&page=2&pageSize=20");
  });

  it("omits page and pageSize when not provided", () => {
    expect(buildRevenueQuery({ from: "2026-08-01", to: "2026-08-30" })).toBe(
      "from=2026-08-01&to=2026-08-30",
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npm test -- revenue-format`
Expected: FAIL — TypeScript error / the two new assertions fail because `buildRevenueQuery` doesn't accept `page`/`pageSize` yet (existing calls without those keys still pass since the params are optional today).

- [ ] **Step 3: Update `types.ts` and `revenue-format.ts`**

In `apps/web/src/app/owner/revenue/types.ts`, add the 3 fields to `RevenueSummary` (after `transactions`):

```ts
  transactions: RevenueTransaction[];
  transactionsPage: number;
  transactionsPageSize: number;
  transactionsTotal: number;
```

In `apps/web/src/app/owner/revenue/revenue-format.ts`, update `buildRevenueQuery`:

```ts
export function buildRevenueQuery(params: {
  venueId?: string;
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
}): string {
  const sp = new URLSearchParams();
  if (params.venueId) sp.set("venueId", params.venueId);
  sp.set("from", params.from);
  sp.set("to", params.to);
  if (params.page !== undefined) sp.set("page", String(params.page));
  if (params.pageSize !== undefined) sp.set("pageSize", String(params.pageSize));
  return sp.toString();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npm test -- revenue-format`
Expected: PASS, all 14 tests (12 existing + 2 new).

- [ ] **Step 5: Add the pager footer to the transactions table**

Replace the full contents of `apps/web/src/app/owner/revenue/revenue-transactions-table.tsx` with:

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "./revenue-format";
import type { RevenueTransaction } from "./types";

function PaidBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-950/40 dark:text-green-400">
      Đã thanh toán
    </span>
  );
}

export function RevenueTransactionsTable({
  transactions,
  page,
  pageSize,
  total,
  onPrev,
  onNext,
}: {
  transactions: RevenueTransaction[];
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const hasPager = total > pageSize;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Danh sách giao dịch</h2>
          <span className="text-sm text-muted-foreground">Tổng: {total} giao dịch</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>MÃ GD</TableHead>
              <TableHead>KHÁCH HÀNG</TableHead>
              <TableHead>THỜI GIAN</TableHead>
              <TableHead>SỐ TIỀN</TableHead>
              <TableHead>THANH TOÁN</TableHead>
              <TableHead>TRẠNG THÁI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Chưa có giao dịch nào.
                </TableCell>
              </TableRow>
            )}
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.transactionCode}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold">{t.customerName}</span>
                    <span className="text-xs text-muted-foreground">{t.customerPhone}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(t.paidAt)}
                </TableCell>
                <TableCell className="font-semibold text-green-600 dark:text-green-400">
                  {formatMoney(t.amount)}
                </TableCell>
                <TableCell>
                  <PaidBadge />
                </TableCell>
                <TableCell>
                  <PaidBadge />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            Hiển thị {total === 0 ? 0 : (page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} / {total}
          </span>
          {hasPager && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onPrev} disabled={page <= 1}>
                Trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onNext}
                disabled={page * pageSize >= total}
              >
                Sau
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Wire up `page.tsx`**

In `apps/web/src/app/owner/revenue/page.tsx`:

Add a `page` state right after the `error` state:

```ts
  const [page, setPage] = useState(1);
```

Reset it to 1 whenever the applied range or venue changes — add this `useEffect` right after the existing `venueParam` line:

```ts
  useEffect(() => {
    setPage(1);
  }, [venueParam, appliedRange]);
```

Update `loadReport`'s `buildRevenueQuery` call to include `page`, and add `page` to its dependency array:

```ts
  const loadReport = useCallback(() => {
    const qs = buildRevenueQuery({
      venueId: venueParam,
      from: appliedRange.from,
      to: appliedRange.to,
      page,
    });
    fetch(`/api/reports/revenue?${qs}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Frevenue");
          return null;
        }
        if (!res.ok) {
          setError(true);
          return null;
        }
        setError(false);
        return res.json();
      })
      .then((json) => json && setData(json))
      .catch(() => setError(true));
  }, [venueParam, appliedRange, page, router]);
```

(`exportQs` stays exactly as-is — no `page`/`pageSize`, matching backend spec §0.1: export is never paginated.)

Update the `RevenueTransactionsTable` usage to pass the new props:

```tsx
          <RevenueTransactionsTable
            transactions={data.transactions}
            page={data.transactionsPage}
            pageSize={data.transactionsPageSize}
            total={data.transactionsTotal}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
```

- [ ] **Step 7: Build and lint**

Run: `cd apps/web && npm run build`
Expected: exits 0.

Run: `npm run lint`
Expected: same pre-existing error count as before this change (35, all in unrelated files — see the note in `2026-09-03-revenue-reports-frontend.md`'s Task 4). No new errors in any `owner/revenue/*` file.

- [ ] **Step 8: Manual verification**

Same approach as `2026-09-03-revenue-reports-frontend.md` Task 4 Step 4 (seed rows directly in the dev DB via `docker exec -i pickleball-postgres-1 psql ...`, log in through `/api/auth/login`, drive the page with Playwright — see that plan for the exact seeding pattern). This time seed **enough paid bookings to exceed one page** (e.g. 25+ rows in one date range) and confirm:

1. Page 1 shows exactly `pageSize` (20) rows, footer reads "Hiển thị 1–20 / 25", "Sau" enabled, "Trước" disabled.
2. Clicking "Sau" loads page 2 (5 rows), footer reads "Hiển thị 21–25 / 25", "Sau" now disabled.
3. Clicking "Trước" goes back to page 1 with the original 20 rows.
4. Changing the date filter (clicking "Lọc") or switching the branch selector resets back to page 1.
5. A range with ≤ 20 transactions shows no pager footer buttons (just the "Hiển thị X–Y / total" text, matching `hasPager` being false) — confirm this doesn't regress the existing small-dataset case already verified in the original frontend plan.
6. "Xuất báo cáo" still downloads **all** transactions in range (not just the current page) — cross-check the CSV row count against `transactionsTotal`, not `pageSize`.

Clean up any seeded rows afterward via the same `DELETE` pattern used in prior verification passes.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/owner/revenue/types.ts apps/web/src/app/owner/revenue/revenue-format.ts apps/web/src/app/owner/revenue/revenue-format.test.ts apps/web/src/app/owner/revenue/revenue-transactions-table.tsx apps/web/src/app/owner/revenue/page.tsx
git commit -m "feat(web): paginate the Revenue Reports transactions table"
```

---

## Self-Review Notes

- **Spec coverage:** backend spec §0.1 (DTO fields, response fields, CSV untouched) → Task 1; frontend spec §2.2 (page state, query builder, pager footer, header total) → Task 2.
- **Placeholder scan:** none — every step has runnable code or an exact command.
- **Type consistency:** `RevenueReport`'s 3 new fields (Task 1) match `RevenueSummary`'s 3 new fields (Task 2) name-for-name; `RevenueTransactionsTable`'s new props (`page`/`pageSize`/`total`/`onPrev`/`onNext`) match exactly how `page.tsx` calls it.
