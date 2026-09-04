# Tìm kiếm và lọc sân (`/venues`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add city filter, sort (name/courts/city), and server-side pagination to `GET /venues` and the `/venues` search page, without breaking the homepage which shares the same endpoint.

**Architecture:** `VenuesService.searchPublic` moves from `repository.find()` returning a plain array to a hybrid `.find()`/`.count()` approach (still plain TypeORM find options for the common sort orders) plus one raw aggregate query only for the `sort=courts` case (mirrors the existing `findMineWithMetrics` pattern), returning `{ items, total, page, pageSize }`. A new `GET /venues/cities` endpoint feeds the city dropdown independently of the current filters. The two existing callers of `GET /venues` (`/venues` page, homepage) are updated for the new response shape; `home-summary.ts`'s `computeHomeSummary` stops re-deriving `venueCount`/`cities` from a possibly-truncated venue array and takes them as parameters instead.

**Tech Stack:** NestJS + TypeORM (Postgres) on the API, Next.js (App Router, client components) on the web app, Jest (api) / Vitest (web) for tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-04-tim-kiem-va-loc-san-design.md` — every task below implements one of its sections; deviations from that spec's exact algorithm sketch (§3.2) are called out explicitly where they happen (this plan uses `.find()`/`.count()` + one raw aggregate instead of a single `QueryBuilder` with `leftJoin`+`groupBy`+`getRawAndEntities`, because it fits the codebase's existing test-mocking patterns and is far less code — the observable behavior/contract is identical).
- `GET /venues` response shape changes from a bare array to `{ items, total, page, pageSize }` — this is a breaking change with exactly 2 callers in the whole codebase (`apps/web/src/app/venues/page.tsx`, `apps/web/src/app/page.tsx`), both updated in this plan.
- Pagination follows the existing `customers.service.ts` convention: `page`/`pageSize` as query strings, clamped in the service (`DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`), private copy of `clampPage`/`clampPageSize` per module — do not extract a shared util (matches precedent in `2026-09-04-revenue-reports-pagination.md`).
- No sport-type filtering, no "Đặt sân" quick-action button, no numbered pagination UI — see spec §2/§7.

---

## Task 1: `GET /venues/cities`

**Files:**
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/venues.controller.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Produces: `VenuesService.listActiveCities(): Promise<{ city: string; count: number }[]>` — used by Task 4 (proxy route) and indirectly by the frontend.

- [ ] **Step 1: Add `orderBy` to the shared raw query builder test mock**

`buildMockRawQueryBuilder` (top of `venues.service.spec.ts`, around line 133) is missing `orderBy` — `listActiveCities` needs it. Add one line so existing usages are unaffected:

```ts
function buildMockRawQueryBuilder<T>(result: T[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.select = jest.fn().mockReturnValue(qb);
  qb.addSelect = jest.fn().mockReturnValue(qb);
  qb.innerJoin = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.groupBy = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.getRawMany = jest.fn().mockResolvedValue(result);
  return qb;
}
```

- [ ] **Step 2: Write the failing test**

Add this new `describe` block right before `describe('VenuesService public reads', ...)` (around line 965):

```ts
describe('VenuesService.listActiveCities', () => {
  it('groups active, non-hidden venues by city, sorted alphabetically', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder([
        { city: 'Hà Nội', count: '3' },
        { city: 'Hồ Chí Minh', count: '5' },
      ]),
    );

    const result = await service.listActiveCities();

    expect(result).toEqual([
      { city: 'Hà Nội', count: 3 },
      { city: 'Hồ Chí Minh', count: 5 },
    ]);
  });

  it('returns an empty array when there are no active venues', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.createQueryBuilder.mockReturnValue(buildMockRawQueryBuilder([]));

    expect(await service.listActiveCities()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/api && npm test -- venues.service.spec.ts -t "listActiveCities"`
Expected: FAIL — `service.listActiveCities is not a function`

- [ ] **Step 4: Implement `listActiveCities`**

In `apps/api/src/courts/venues.service.ts`, add this method to `VenuesService` (a good spot is right after `searchPublic`, once Task 2 has rewritten it — for now, add it right after the existing `searchPublic` method, before `findVenueIdsWithAvailability`):

```ts
async listActiveCities(): Promise<{ city: string; count: number }[]> {
  const rows = await this.venuesRepository
    .createQueryBuilder('venue')
    .select('venue.city', 'city')
    .addSelect('COUNT(*)', 'count')
    .where('venue.status = :status', { status: VenueStatus.ACTIVE })
    .andWhere('venue.is_hidden = false')
    .groupBy('venue.city')
    .orderBy('venue.city', 'ASC')
    .getRawMany<{ city: string; count: string }>();
  return rows.map((row) => ({ city: row.city, count: Number(row.count) }));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && npm test -- venues.service.spec.ts -t "listActiveCities"`
Expected: PASS (2 tests)

- [ ] **Step 6: Add the controller route**

In `apps/api/src/courts/venues.controller.ts`, add a `cities` route. It must come before `@Get(':id')` — put it right after the existing `search()` method (which is `@Get()`) and before `@Get('by-slug/:slug')`:

```ts
  @Get('cities')
  listCities() {
    return this.venuesService.listActiveCities();
  }
```

- [ ] **Step 7: Run the full venues service test suite**

Run: `cd apps/api && npm test -- venues.service.spec.ts`
Expected: PASS (all existing tests still pass, plus the 2 new ones)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.controller.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): add GET /venues/cities for the city filter dropdown"
```

---

## Task 2: `searchPublic` — city filter, sort, pagination, response shape

This is the core rewrite. It changes `searchPublic`'s signature and return type, so every existing test in the `describe('VenuesService public reads', ...)` block that calls it needs updating. `sort=courts` is deliberately deferred to Task 3 — this task implements `sort` values `undefined | 'name' | 'city'` plus the default (`createdAt DESC`), throwing for `'courts'` for now (Task 3 removes that guard and implements it).

**Files:**
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/venues.controller.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Consumes: `VenueStatus`, `CourtStatus`, `DATE_PATTERN`, `TIME_PATTERN`, `findVenueIdsWithAvailability` (all already in the file, unchanged).
- Produces: `VenuesService.searchPublic(query?, date?, time?, city?, sort?, pageRaw?, pageSizeRaw?): Promise<SearchVenuesResult>` where `SearchVenuesResult = { items: VenueWithCourtsCount[]; total: number; page: number; pageSize: number }`. `VenuesService.buildSearchWhere` and `VenuesService.attachCourtsCount` are new private helpers Task 3 also calls.

- [ ] **Step 1: Replace the `searchPublic` tests with the new contract**

In `apps/api/src/courts/venues.service.spec.ts`, replace the entire body of `describe('VenuesService public reads', ...)` (currently lines 965–1106, from `it('searchPublic without a query...` through the `findPublicById` tests at the end) with:

```ts
describe('VenuesService public reads', () => {
  it('searchPublic without a query returns only active, non-hidden venues, newest first, wrapped in a page envelope', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(1);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1', name: 'A' }]);
    courtsRepo.find.mockResolvedValue([]);

    const result = await service.searchPublic();

    expect(venuesRepo.count).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE, isHidden: false },
    });
    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE, isHidden: false },
      order: { createdAt: 'DESC' },
      skip: 0,
      take: 20,
    });
    expect(result).toEqual({
      items: [{ id: 'venue-1', name: 'A', courtsCount: 0 }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('enriches each venue with its count of active courts', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(2);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }, { id: 'venue-2' }]);
    courtsRepo.find.mockResolvedValue([
      { id: 'court-1', venueId: 'venue-1' },
      { id: 'court-2', venueId: 'venue-1' },
      { id: 'court-3', venueId: 'venue-2' },
    ]);

    const result = await service.searchPublic();

    expect(courtsRepo.find).toHaveBeenCalledWith({
      where: { venueId: In(['venue-1', 'venue-2']), status: CourtStatus.ACTIVE },
    });
    expect(result.items).toEqual([
      { id: 'venue-1', courtsCount: 2 },
      { id: 'venue-2', courtsCount: 1 },
    ]);
  });

  it('returns an empty result without querying venues or courts when total is 0', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);

    const result = await service.searchPublic();

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(venuesRepo.find).not.toHaveBeenCalled();
    expect(courtsRepo.find).not.toHaveBeenCalled();
  });

  it('with a keyword and no city, matches by name, address, or city (3 OR-branches)', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);

    await service.searchPublic('Sport');

    expect(venuesRepo.count).toHaveBeenCalledWith({
      where: [
        { status: VenueStatus.ACTIVE, isHidden: false, name: ILike('%Sport%') },
        { status: VenueStatus.ACTIVE, isHidden: false, address: ILike('%Sport%') },
        { status: VenueStatus.ACTIVE, isHidden: false, city: ILike('%Sport%') },
      ],
    });
  });

  it('filters by an exact city match', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(1);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1', city: 'Hà Nội' }]);
    courtsRepo.find.mockResolvedValue([]);

    await service.searchPublic(undefined, undefined, undefined, 'Hà Nội');

    expect(venuesRepo.count).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE, isHidden: false, city: 'Hà Nội' },
    });
  });

  it('combines a keyword with an exact city filter using only the name/address OR-branches (2, not 3)', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);

    await service.searchPublic('Sport', undefined, undefined, 'Hà Nội');

    expect(venuesRepo.count).toHaveBeenCalledWith({
      where: [
        { status: VenueStatus.ACTIVE, isHidden: false, city: 'Hà Nội', name: ILike('%Sport%') },
        { status: VenueStatus.ACTIVE, isHidden: false, city: 'Hà Nội', address: ILike('%Sport%') },
      ],
    });
  });

  it('sorts by name ascending when sort="name"', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(1);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);
    courtsRepo.find.mockResolvedValue([]);

    await service.searchPublic(undefined, undefined, undefined, undefined, 'name');

    expect(venuesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { name: 'ASC' } }),
    );
  });

  it('sorts by city then name ascending when sort="city"', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(1);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);
    courtsRepo.find.mockResolvedValue([]);

    await service.searchPublic(undefined, undefined, undefined, undefined, 'city');

    expect(venuesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { city: 'ASC', name: 'ASC' } }),
    );
  });

  it('throws for an invalid sort value', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.searchPublic(undefined, undefined, undefined, undefined, 'invalid'),
    ).rejects.toThrow("sort phải là 'name', 'courts' hoặc 'city'");
  });

  it('paginates with the given page/pageSize', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(30);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-6' }]);
    courtsRepo.find.mockResolvedValue([]);

    const result = await service.searchPublic(
      undefined, undefined, undefined, undefined, undefined, '2', '5',
    );

    expect(venuesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(5);
    expect(result.total).toBe(30);
  });

  it('clamps an out-of-range page to 1 and an out-of-range pageSize to 100', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);

    const result = await service.searchPublic(
      undefined, undefined, undefined, undefined, undefined, '0', '9999',
    );

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(100);
  });

  it('searchPublic throws when only date is given without time', async () => {
    const { service } = await buildTestingModule();
    await expect(service.searchPublic(undefined, '2099-01-01')).rejects.toThrow(
      'date và time phải được truyền cùng nhau',
    );
  });

  it('searchPublic throws when only time is given without date', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.searchPublic(undefined, undefined, '10:00'),
    ).rejects.toThrow('date và time phải được truyền cùng nhau');
  });

  it('searchPublic throws for a malformed date', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.searchPublic(undefined, '01-01-2099', '10:00'),
    ).rejects.toThrow('date phải theo định dạng YYYY-MM-DD');
  });

  it('searchPublic throws for a past date', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.searchPublic(undefined, '2020-01-01', '10:00'),
    ).rejects.toThrow('Không thể tìm sân của ngày trong quá khứ');
  });

  it('searchPublic throws for a malformed time', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.searchPublic(undefined, '2099-01-01', '25:00'),
    ).rejects.toThrow('time phải theo định dạng HH:mm');
  });

  it('searchPublic with date+time only returns venues with a court free at that time', async () => {
    const { service, venuesRepo, courtsRepo, bookingSlotsRepo } =
      await buildTestingModule();
    venuesRepo.find
      .mockResolvedValueOnce([
        { id: 'venue-free' },
        { id: 'venue-booked' },
        { id: 'venue-no-matching-grid' },
      ])
      .mockResolvedValueOnce([{ id: 'venue-free', name: 'Free Venue' }]);
    venuesRepo.count.mockResolvedValue(1);
    courtsRepo.find
      .mockResolvedValueOnce([
        {
          id: 'court-free', venueId: 'venue-free',
          openTime: '06:00', closeTime: '22:00', slotDurationMinutes: 60,
        },
        {
          id: 'court-booked', venueId: 'venue-booked',
          openTime: '06:00', closeTime: '22:00', slotDurationMinutes: 60,
        },
        {
          id: 'court-odd-grid', venueId: 'venue-no-matching-grid',
          openTime: '06:00', closeTime: '22:00', slotDurationMinutes: 90,
        },
      ])
      .mockResolvedValueOnce([]);
    bookingSlotsRepo.find.mockResolvedValue([
      { courtId: 'court-booked', date: '2099-01-01', slotStart: '10:00' },
    ]);

    const result = await service.searchPublic(undefined, '2099-01-01', '10:00');

    expect(bookingSlotsRepo.find).toHaveBeenCalledWith({
      where: {
        courtId: In(['court-free', 'court-booked']),
        date: '2099-01-01',
        slotStart: '10:00',
      },
    });
    expect(venuesRepo.count).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE, isHidden: false, id: In(['venue-free']) },
    });
    expect(result.items.map((v) => v.id)).toEqual(['venue-free']);
  });

  it('returns an empty result when date+time is given but no venue has a free slot', async () => {
    const { service, venuesRepo, courtsRepo, bookingSlotsRepo } =
      await buildTestingModule();
    venuesRepo.find.mockResolvedValueOnce([{ id: 'venue-booked' }]);
    courtsRepo.find.mockResolvedValueOnce([
      {
        id: 'court-booked', venueId: 'venue-booked',
        openTime: '06:00', closeTime: '22:00', slotDurationMinutes: 60,
      },
    ]);
    bookingSlotsRepo.find.mockResolvedValue([
      { courtId: 'court-booked', date: '2099-01-01', slotStart: '10:00' },
    ]);

    const result = await service.searchPublic(undefined, '2099-01-01', '10:00');

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(venuesRepo.count).not.toHaveBeenCalled();
  });

  it('findPublicById throws NotFoundException for an inactive, hidden, or missing venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.findPublicById('venue-1')).rejects.toThrow(
      'Venue venue-1 không tồn tại',
    );
    expect(venuesRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'venue-1', status: VenueStatus.ACTIVE, isHidden: false },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npm test -- venues.service.spec.ts`
Expected: FAIL — `searchPublic` still has the old signature/behavior (e.g. `venuesRepo.count` never called, response is a bare array not `{items,...}`).

- [ ] **Step 3: Add the `FindOptionsWhere`/`FindOptionsOrder` imports**

In `apps/api/src/courts/venues.service.ts`, update the `typeorm` import line:

```ts
import {
  DataSource,
  FindOptionsOrder,
  FindOptionsWhere,
  ILike,
  In,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
```

- [ ] **Step 4: Replace `searchPublic` and its return type**

Replace the existing `searchPublic` method and the `VenueWithCourtsCount` computation it inlines (the whole method body, from `async searchPublic(` through its closing `}`, currently sitting between `findMineWithMetrics`'s `sortVenues` helper... no — it's the method defined right after `findByIdOrThrow`/`findPendingVenues`/etc., before `findVenueIdsWithAvailability`) with:

```ts
export interface SearchVenuesResult {
  items: VenueWithCourtsCount[];
  total: number;
  page: number;
  pageSize: number;
}
```

Add that interface near the top of the file, next to the existing `VenueWithCourtsCount`/`VenueWithMetrics` interfaces. Then add these two module-level constants and functions right below the existing `DEFAULT_OPERATING_HOURS` constant (matching the private-per-module clamp pattern from `customers.service.ts`):

```ts
const SEARCH_DEFAULT_PAGE_SIZE = 20;
const SEARCH_MAX_PAGE_SIZE = 100;

function clampPage(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clampPageSize(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return SEARCH_DEFAULT_PAGE_SIZE;
  return Math.min(SEARCH_MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}
```

Now replace the `searchPublic` method body:

```ts
async searchPublic(
  query?: string,
  date?: string,
  time?: string,
  city?: string,
  sort?: string,
  pageRaw?: string,
  pageSizeRaw?: string,
): Promise<SearchVenuesResult> {
  if ((date && !time) || (time && !date)) {
    throw new BadRequestException(
      'date và time phải được truyền cùng nhau',
    );
  }
  if (date && !DATE_PATTERN.test(date)) {
    throw new BadRequestException('date phải theo định dạng YYYY-MM-DD');
  }
  if (date) {
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) {
      throw new BadRequestException(
        'Không thể tìm sân của ngày trong quá khứ',
      );
    }
  }
  if (time && !TIME_PATTERN.test(time)) {
    throw new BadRequestException('time phải theo định dạng HH:mm');
  }
  if (sort && sort !== 'name' && sort !== 'courts' && sort !== 'city') {
    throw new BadRequestException(
      "sort phải là 'name', 'courts' hoặc 'city'",
    );
  }

  const page = clampPage(pageRaw);
  const pageSize = clampPageSize(pageSizeRaw);

  let availableVenueIds: string[] | undefined;
  if (date && time) {
    const candidates = await this.venuesRepository.find({
      where: this.buildSearchWhere(query, city),
      select: ['id'],
    });
    if (candidates.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    const candidateIds = candidates.map((venue) => venue.id);
    const courts = await this.courtsRepository.find({
      where: { venueId: In(candidateIds), status: CourtStatus.ACTIVE },
    });
    availableVenueIds = [
      ...(await this.findVenueIdsWithAvailability(courts, date, time)),
    ];
    if (availableVenueIds.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
  }

  if (sort === 'courts') {
    return this.searchPublicSortedByCourts(
      query,
      city,
      availableVenueIds,
      page,
      pageSize,
    );
  }

  const where = this.buildSearchWhere(query, city, availableVenueIds);
  const total = await this.venuesRepository.count({ where });
  if (total === 0) {
    return { items: [], total: 0, page, pageSize };
  }
  const order: FindOptionsOrder<Venue> =
    sort === 'name'
      ? { name: 'ASC' }
      : sort === 'city'
        ? { city: 'ASC', name: 'ASC' }
        : { createdAt: 'DESC' };
  const venues = await this.venuesRepository.find({
    where,
    order,
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const items = await this.attachCourtsCount(venues);
  return { items, total, page, pageSize };
}

private buildSearchWhere(
  query?: string,
  city?: string,
  venueIds?: string[],
): FindOptionsWhere<Venue> | FindOptionsWhere<Venue>[] {
  const common: FindOptionsWhere<Venue> = {
    status: VenueStatus.ACTIVE,
    isHidden: false,
  };
  if (city) common.city = city;
  if (venueIds) common.id = In(venueIds);

  if (!query) return common;

  const branches: FindOptionsWhere<Venue>[] = [
    { ...common, name: ILike(`%${query}%`) },
    { ...common, address: ILike(`%${query}%`) },
  ];
  if (!city) {
    branches.push({ ...common, city: ILike(`%${query}%`) });
  }
  return branches;
}

private async attachCourtsCount(
  venues: Venue[],
): Promise<VenueWithCourtsCount[]> {
  if (venues.length === 0) return [];
  const courts = await this.courtsRepository.find({
    where: {
      venueId: In(venues.map((venue) => venue.id)),
      status: CourtStatus.ACTIVE,
    },
  });
  const courtsCountByVenue = new Map<string, number>();
  for (const court of courts) {
    courtsCountByVenue.set(
      court.venueId,
      (courtsCountByVenue.get(court.venueId) ?? 0) + 1,
    );
  }
  return venues.map((venue) => ({
    ...venue,
    courtsCount: courtsCountByVenue.get(venue.id) ?? 0,
  }));
}

private async searchPublicSortedByCourts(
  _query: string | undefined,
  _city: string | undefined,
  _availableVenueIds: string[] | undefined,
  page: number,
  pageSize: number,
): Promise<SearchVenuesResult> {
  throw new BadRequestException(
    "sort phải là 'name', 'courts' hoặc 'city'",
  );
}
```

Note: `searchPublicSortedByCourts` is a temporary stub for this task — it deliberately throws so that `sort=courts` still behaves like an unimplemented/invalid value until Task 3 replaces it. This keeps Task 2 shippable on its own without a half-working `sort=courts`.

Delete the old inline courts-count block that used to live at the bottom of the original `searchPublic` (the `courtsCountByVenue` `Map` construction) — it's now `attachCourtsCount`, and delete the old `date`/`time` filtering block that lived after it (`findVenueIdsWithAvailability` call + `.filter(...)`) — that logic is now inlined above, before the `sort === 'courts'` branch.

- [ ] **Step 5: Update the controller**

In `apps/api/src/courts/venues.controller.ts`, replace the `search()` method:

```ts
  @Get()
  search(
    @Query('query') query?: string,
    @Query('date') date?: string,
    @Query('time') time?: string,
    @Query('city') city?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.venuesService.searchPublic(
      query,
      date,
      time,
      city,
      sort,
      page,
      pageSize,
    );
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && npm test -- venues.service.spec.ts`
Expected: PASS (all tests, including the untouched ones earlier in the file)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.controller.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): add city filter, name/city sort, and pagination to GET /venues"
```

---

## Task 3: `sort=courts`

**Files:**
- Modify: `apps/api/src/courts/venues.service.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Consumes: `VenuesService.buildSearchWhere`, `CourtStatus` (from Task 2).
- Produces: `VenuesService.searchPublicSortedByCourts` now returns real sorted/paginated results instead of throwing.

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block right after `describe('VenuesService public reads', ...)` closes in `venues.service.spec.ts`:

```ts
describe('VenuesService.searchPublic — sort=courts', () => {
  it('orders venues by count of active courts, descending, tie-broken by name ascending', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.find
      .mockResolvedValueOnce([
        { id: 'venue-a', name: 'Venue A' },
        { id: 'venue-b', name: 'Venue B' },
        { id: 'venue-c', name: 'Venue C' },
      ])
      .mockResolvedValueOnce([
        { id: 'venue-a', name: 'Venue A' },
        { id: 'venue-b', name: 'Venue B' },
        { id: 'venue-c', name: 'Venue C' },
      ]);
    courtsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder([
        { venueId: 'venue-a', count: '1' },
        { venueId: 'venue-c', count: '3' },
      ]),
    );

    const result = await service.searchPublic(
      undefined, undefined, undefined, undefined, 'courts',
    );

    expect(result.items.map((v) => v.id)).toEqual([
      'venue-c', 'venue-a', 'venue-b',
    ]);
    expect(result.items.map((v) => v.courtsCount)).toEqual([3, 1, 0]);
    expect(result.total).toBe(3);
  });

  it('paginates the sorted-by-count list', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.find
      .mockResolvedValueOnce([
        { id: 'venue-a', name: 'Venue A' },
        { id: 'venue-b', name: 'Venue B' },
        { id: 'venue-c', name: 'Venue C' },
      ])
      .mockResolvedValueOnce([{ id: 'venue-b', name: 'Venue B' }]);
    courtsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder([
        { venueId: 'venue-a', count: '3' },
        { venueId: 'venue-b', count: '2' },
        { venueId: 'venue-c', count: '1' },
      ]),
    );

    const result = await service.searchPublic(
      undefined, undefined, undefined, undefined, 'courts', '2', '1',
    );

    expect(result.items.map((v) => v.id)).toEqual(['venue-b']);
    expect(result.total).toBe(3);
    expect(result.page).toBe(2);
  });

  it('returns an empty result when no venue matches the filters', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValueOnce([]);

    const result = await service.searchPublic(
      undefined, undefined, undefined, undefined, 'courts',
    );

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npm test -- venues.service.spec.ts -t "sort=courts"`
Expected: FAIL — `searchPublicSortedByCourts` currently throws `BadRequestException` unconditionally (the Task 2 stub).

- [ ] **Step 3: Implement `searchPublicSortedByCourts`**

In `apps/api/src/courts/venues.service.ts`, replace the stub body added in Task 2:

```ts
private async searchPublicSortedByCourts(
  query: string | undefined,
  city: string | undefined,
  availableVenueIds: string[] | undefined,
  page: number,
  pageSize: number,
): Promise<SearchVenuesResult> {
  const candidates = await this.venuesRepository.find({
    where: this.buildSearchWhere(query, city, availableVenueIds),
    select: ['id', 'name'],
  });
  const total = candidates.length;
  if (total === 0) {
    return { items: [], total: 0, page, pageSize };
  }

  const candidateIds = candidates.map((venue) => venue.id);
  const countRows = await this.courtsRepository
    .createQueryBuilder('court')
    .select('court.venue_id', 'venueId')
    .addSelect('COUNT(*)', 'count')
    .where('court.status = :status', { status: CourtStatus.ACTIVE })
    .andWhere('court.venue_id IN (:...ids)', { ids: candidateIds })
    .groupBy('court.venue_id')
    .getRawMany<{ venueId: string; count: string }>();
  const countByVenue = new Map(
    countRows.map((row) => [row.venueId, Number(row.count)]),
  );

  const sorted = [...candidates].sort((a, b) => {
    const diff =
      (countByVenue.get(b.id) ?? 0) - (countByVenue.get(a.id) ?? 0);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
  const pageIds = sorted
    .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    .map((venue) => venue.id);
  if (pageIds.length === 0) {
    return { items: [], total, page, pageSize };
  }

  const pageVenues = await this.venuesRepository.find({
    where: { id: In(pageIds) },
  });
  const venueById = new Map(pageVenues.map((venue) => [venue.id, venue]));
  const items = pageIds.map((id) => ({
    ...venueById.get(id)!,
    courtsCount: countByVenue.get(id) ?? 0,
  }));
  return { items, total, page, pageSize };
}
```

Also remove the now-unused `sort === 'courts'` guard message duplication concern: the top-level `searchPublic` validation (`sort !== 'name' && sort !== 'courts' && sort !== 'city'`) already allows `'courts'` through — no change needed there, it was already permissive since Task 2.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npm test -- venues.service.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): implement sort=courts for GET /venues"
```

---

## Task 4: Next.js proxy routes

**Files:**
- Modify: `apps/web/src/app/api/venues/route.ts`
- Create: `apps/web/src/app/api/venues/cities/route.ts`

**Interfaces:**
- Consumes: `API_BASE_URL` from `@/lib/api-config`, `toNextResponse` from `@/lib/proxy-response` (both already used in `apps/web/src/app/api/venues/route.ts`).
- Produces: `GET /api/venues/cities` (new), `GET /api/venues` now forwards `city`/`sort`/`page`/`pageSize` in addition to `query`/`date`/`time`.

No unit tests exist for these thin proxy files (none exist for the current `route.ts` either) — verified manually in Task 6/7 once the pages that call them are wired up.

- [ ] **Step 1: Widen the query param whitelist in `apps/web/src/app/api/venues/route.ts`**

Change:

```ts
  for (const key of ['query', 'date', 'time']) {
```

to:

```ts
  for (const key of ['query', 'date', 'time', 'city', 'sort', 'page', 'pageSize']) {
```

- [ ] **Step 2: Create `apps/web/src/app/api/venues/cities/route.ts`**

```ts
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetch(`${API_BASE_URL}/venues/cities`);
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/venues/route.ts apps/web/src/app/api/venues/cities/route.ts
git commit -m "feat(web): proxy GET /venues/cities and forward new venue search params"
```

---

## Task 5: `home-summary.ts` — stop deriving `venueCount`/`cities` from a truncated array

**Files:**
- Modify: `apps/web/src/lib/home-summary.ts`
- Test: `apps/web/src/lib/home-summary.test.ts`

**Interfaces:**
- Produces: `computeHomeSummary(venues: PublicVenueSummary[], venueCount: number, cities: CityCount[]): HomeSummary` (signature change — `venueCount` and `cities` are now parameters, not derived).

- [ ] **Step 1: Replace the test file**

Overwrite `apps/web/src/lib/home-summary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  computeHomeSummary,
  type PublicVenueSummary,
  type CityCount,
} from './home-summary';

function venue(overrides: Partial<PublicVenueSummary>): PublicVenueSummary {
  return {
    id: 'venue-1',
    name: 'Sân A',
    address: '123 Đường ABC',
    city: 'Hà Nội',
    courtsCount: 2,
    logoUrl: null,
    ...overrides,
  };
}

describe('computeHomeSummary', () => {
  it('returns all-zero/empty values for an empty venue list', () => {
    expect(computeHomeSummary([], 0, [])).toEqual({
      venueCount: 0,
      courtCount: 0,
      featured: [],
      cities: [],
    });
  });

  it('sums courtsCount across all venues for courtCount', () => {
    const venues = [
      venue({ id: 'v1', courtsCount: 2 }),
      venue({ id: 'v2', courtsCount: 3 }),
      venue({ id: 'v3', courtsCount: 0 }),
    ];
    expect(computeHomeSummary(venues, 3, []).courtCount).toBe(5);
  });

  it('uses the venueCount argument as-is, not venues.length', () => {
    const venues = [venue({ id: 'v1' }), venue({ id: 'v2' })];
    expect(computeHomeSummary(venues, 150, []).venueCount).toBe(150);
  });

  it('caps featured at the first 6 venues, preserving input order', () => {
    const venues = Array.from({ length: 8 }, (_, i) =>
      venue({ id: `v${i}`, name: `Sân ${i}` }),
    );
    const featured = computeHomeSummary(venues, 8, []).featured;
    expect(featured).toHaveLength(6);
    expect(featured.map((v) => v.id)).toEqual([
      'v0', 'v1', 'v2', 'v3', 'v4', 'v5',
    ]);
  });

  it('returns fewer than 6 featured venues when there are fewer than 6 total', () => {
    const venues = [venue({ id: 'v1' }), venue({ id: 'v2' })];
    expect(computeHomeSummary(venues, 2, []).featured).toHaveLength(2);
  });

  it('passes logoUrl through unchanged for featured venues', () => {
    const venues = [
      venue({ id: 'v1', logoUrl: '/uploads/venues/v1/logo.webp' }),
      venue({ id: 'v2', logoUrl: null }),
    ];
    expect(
      computeHomeSummary(venues, 2, []).featured.map((v) => v.logoUrl),
    ).toEqual(['/uploads/venues/v1/logo.webp', null]);
  });

  it('passes the cities argument through unchanged, without re-deriving it from venues', () => {
    const cities: CityCount[] = [
      { name: 'Hà Nội', count: 12 },
      { name: 'Hồ Chí Minh', count: 30 },
    ];
    const venues = [venue({ id: 'v1', city: 'Đà Nẵng' })];
    expect(computeHomeSummary(venues, 1, cities).cities).toEqual(cities);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npm test -- home-summary`
Expected: FAIL — `computeHomeSummary` still takes only 1 argument and returns `venueCount: venues.length`, so e.g. `computeHomeSummary(venues, 150, []).venueCount` is called with 3 args but the current function ignores extra args and returns `2`, not `150`.

- [ ] **Step 3: Update `computeHomeSummary`**

Overwrite `apps/web/src/lib/home-summary.ts`:

```ts
export interface PublicVenueSummary {
  id: string;
  name: string;
  address: string;
  city: string;
  courtsCount: number;
  logoUrl: string | null;
}

export interface CityCount {
  name: string;
  count: number;
}

export interface HomeSummary {
  venueCount: number;
  courtCount: number;
  featured: PublicVenueSummary[];
  cities: CityCount[];
}

export function computeHomeSummary(
  venues: PublicVenueSummary[],
  venueCount: number,
  cities: CityCount[],
): HomeSummary {
  return {
    venueCount,
    courtCount: venues.reduce((sum, venue) => sum + venue.courtsCount, 0),
    featured: venues.slice(0, 6),
    cities,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npm test -- home-summary`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/home-summary.ts apps/web/src/lib/home-summary.test.ts
git commit -m "refactor(web): compute homepage venueCount/cities from full totals, not a page slice"
```

---

## Task 6: Homepage — fetch venues + cities against the new API shape

**Files:**
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/venues?pageSize=100` → `{ items, total, page, pageSize }` (Task 2), `GET /api/venues/cities` → `{ city, count }[]` (Task 1+4), `computeHomeSummary(venues, venueCount, cities)` (Task 5).

No new automated tests — `page.tsx` is a client component that only orchestrates fetches into `computeHomeSummary` (already unit-tested in Task 5); this task is verified manually in Step 3.

- [ ] **Step 1: Update the venues+cities fetch**

In `apps/web/src/app/page.tsx`, change the import line:

```ts
import {
  computeHomeSummary,
  type PublicVenueSummary,
  type CityCount,
} from "@/lib/home-summary";
```

Replace the state and effect:

```ts
  const [venues, setVenues] = useState<PublicVenueSummary[] | null>(null);
  const [venueCount, setVenueCount] = useState(0);
  const [cities, setCities] = useState<CityCount[]>([]);
  const [query, setQuery] = useState("");
  const [dateTime, setDateTime] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/venues?pageSize=100").then((res) => res.json()),
      fetch("/api/venues/cities").then((res) => res.json()),
    ]).then(([venuesData, citiesData]) => {
      setVenues(Array.isArray(venuesData.items) ? venuesData.items : []);
      setVenueCount(
        typeof venuesData.total === "number" ? venuesData.total : 0,
      );
      setCities(
        Array.isArray(citiesData)
          ? citiesData.map((c: { city: string; count: number }) => ({
              name: c.city,
              count: c.count,
            }))
          : [],
      );
    });
  }, []);

  const summary = computeHomeSummary(venues ?? [], venueCount, cities);
```

Nothing else in the file changes — every JSX reference (`summary.venueCount`, `summary.courtCount`, `summary.featured`, `summary.cities`) already uses the same field names on `HomeSummary`, which is unchanged.

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors in `page.tsx` or `home-summary.ts`

- [ ] **Step 3: Manual verification**

Run: `cd apps/api && npm run start:dev` (in one terminal) and `cd apps/web && npm run dev` (in another), then open `/` in a browser.
Expected: hero shows the correct total venue/court counts, "Cơ sở nổi bật" shows up to 6 newest venues, city chips section shows the real city list (or is hidden if there are none) — same visible behavior as before this plan, just sourced from `total`/`/venues/cities` instead of `venues.length`/a client-side reduce.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "fix(web): fetch homepage venue stats from the new paginated GET /venues"
```

---

## Task 7: `/venues` page — city filter, sort, pager, updated card fields

**Files:**
- Modify: `apps/web/src/app/venues/page.tsx`

**Interfaces:**
- Consumes: `GET /api/venues?...&city=&sort=&page=&pageSize=20` → `{ items, total, page, pageSize }` (Task 2/4), `GET /api/venues/cities` → `{ city, count }[]` (Task 1/4), `Button` from `@/components/ui/button`.

No automated tests — this page has none today (verified manually, consistent with the rest of this file's test coverage). Verified manually in Step 2.

- [ ] **Step 1: Rewrite the page**

Overwrite `apps/web/src/app/venues/page.tsx`:

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;

interface PublicVenue {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  courtsCount: number;
}

interface CityOption {
  city: string;
  count: number;
}

type SortOption = "" | "name" | "courts" | "city";

export default function VenuesSearchPage() {
  return (
    <Suspense>
      <VenuesSearchPageContent />
    </Suspense>
  );
}

function VenuesSearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get("date");
  const time = searchParams.get("time");

  const [query, setQuery] = useState(searchParams.get("query") ?? "");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<SortOption>("");
  const [page, setPage] = useState(1);
  const [venues, setVenues] = useState<PublicVenue[] | null>(null);
  const [total, setTotal] = useState(0);
  const [cities, setCities] = useState<CityOption[] | null>(null);

  useEffect(() => {
    fetch("/api/venues/cities")
      .then((res) => res.json())
      .then((data) => setCities(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, city, sort]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (date) params.set("date", date);
      if (time) params.set("time", time);
      if (city) params.set("city", city);
      if (sort) params.set("sort", sort);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      fetch(`/api/venues?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          setVenues(Array.isArray(data.items) ? data.items : []);
          setTotal(typeof data.total === "number" ? data.total : 0);
        });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, city, sort, page, date, time]);

  function clearDateTimeFilter() {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    const qs = params.toString();
    router.push(`/venues${qs ? `?${qs}` : ""}`);
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Tìm sân</h1>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-2">
          <Label htmlFor="query">Tìm theo tên, địa chỉ hoặc thành phố</Label>
          <Input
            id="query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Thành phố</Label>
          <select
            id="city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="h-9 rounded-lg border px-2.5 text-sm"
          >
            <option value="">Tất cả thành phố</option>
            {cities?.map((option) => (
              <option key={option.city} value={option.city}>
                {option.city} ({option.count})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sort">Sắp xếp</Label>
          <select
            id="sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
            className="h-9 rounded-lg border px-2.5 text-sm"
          >
            <option value="">Mới nhất</option>
            <option value="name">Tên A-Z</option>
            <option value="courts">Nhiều sân nhất</option>
            <option value="city">Theo tỉnh thành</option>
          </select>
        </div>
      </div>

      {date && time && (
        <div className="flex w-fit items-center gap-2 rounded-full bg-green-50 py-1 pl-3 pr-1 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
          Đang lọc sân trống lúc {time} ngày {date.split("-").reverse().join("/")}
          <button
            type="button"
            onClick={clearDateTimeFilter}
            aria-label="Bỏ lọc theo ngày/giờ"
            className="flex size-5 items-center justify-center rounded-full hover:bg-green-100 dark:hover:bg-green-900/60"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {venues === null && <p>Đang tải...</p>}
      {venues !== null && venues.length === 0 && (
        <p className="text-muted-foreground">Không tìm thấy sân nào phù hợp.</p>
      )}

      <div className="flex flex-col gap-4">
        {venues?.map((venue) => (
          <Link key={venue.id} href={`/venues/${venue.id}`}>
            <Card className="transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle className="text-base">{venue.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {venue.district ? `${venue.district}, ` : ""}
                  {venue.city}
                </span>
                <span className="text-sm text-muted-foreground">
                  {venue.courtsCount} sân
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} cơ sở</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              Trước
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * PAGE_SIZE >= total}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

With both dev servers still running from Task 6 Step 3, open `/venues`:
- Type a keyword → results update after ~300ms, matches name/address/city as before.
- Pick a city from the dropdown → results narrow to that city; combine with a keyword → still narrows correctly (name/address only).
- Change "Sắp xếp" to "Nhiều sân nhất" → order changes to descending court count.
- Change "Sắp xếp" to "Tên A-Z" → alphabetical order.
- If there are more than 20 matching venues, "Trước"/"Sau" appear and page correctly, disabled at the first/last page; if 20 or fewer, no pager shown.
- Changing any filter resets back to page 1.
- Navigate from `/` via a city chip (`/venues?query=<city>`) → still works (seeded `query` from the URL, existing behavior untouched).
- Navigate to `/venues?date=...&time=...` (e.g. from a venue detail page's "other times" link, if one exists) → the removable date/time chip still works and narrows results correctly combined with the new filters.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/venues/page.tsx
git commit -m "feat(web): add city filter, sort, and pagination to the /venues search page"
```

---

## Final check

- [ ] Run the full backend suite: `cd apps/api && npm test`
- [ ] Run the full frontend suite: `cd apps/web && npm test`
- [ ] Run the frontend build: `cd apps/web && npm run build`
- [ ] Run lint: `npm run lint` (repo root, if configured for both apps — otherwise run per-app lint scripts)
