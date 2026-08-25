# Module: Page View Analytics (Lượt xem trang) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/07-luot-xem-trang.md](../../spec/07-luot-xem-trang.md) (khảo sát UI sanbong.vn thực tế)
**Dựa trên quyết định của:** [2026-08-25-dashboard-design.md](./2026-08-25-dashboard-design.md) (scope theo venue), [2026-08-26-revenue-reports-design.md](./2026-08-26-revenue-reports-design.md) (định nghĩa "kỳ trước")

## 1. Mục tiêu

Phân tích lưu lượng truy cập trang đặt sân công khai (`/venues/[id]`): tổng lượt xem, khách unique, tỷ lệ mobile, giờ cao điểm, nguồn traffic, và tỷ lệ chuyển đổi view → booking theo từng venue.

Tính năng hoàn toàn mới — chưa có bất kỳ cơ chế tracking nào trong hệ thống. "Cơ sở" trong tài liệu khảo sát tương ứng với `venue` đã có (không phải module Chi nhánh — dùng lại cách scope-theo-venue đã chốt ở Dashboard).

## 2. Data model

**page_views** (insert-only, không có update)

| Trường | Mô tả |
|---|---|
| id | UUID |
| venue_id | → venues |
| visitor_id | UUID do frontend tự sinh (`crypto.randomUUID()`), lưu ở `localStorage`, gửi kèm mỗi lần ghi nhận — định danh khách ẩn danh theo trình duyệt/thiết bị |
| user_id | nullable → users — gắn nếu người xem đang đăng nhập tại thời điểm xem (đọc từ JWT nếu request có, không bắt buộc) |
| is_mobile | BOOLEAN — server tự phân tích từ header `User-Agent` lúc ghi nhận sự kiện |
| referrer_source | `direct` \| `search` \| `social` \| `other` — server phân loại từ header `Referer` |
| created_at | thời điểm xem |

Không dùng `visitor_id`/`user_id` để merge danh tính đa thiết bị — "khách unique" luôn đếm theo `visitor_id` phân biệt, kể cả khi cùng một người dùng 2 thiết bị (giữ đơn giản, xem §6 Ngoài phạm vi).

## 3. API endpoints

### 3.1. Ghi nhận lượt xem (public, không cần đăng nhập)

```
POST /analytics/page-views
  body: { venueId, visitorId, referrer? }
```

Frontend gọi 1 lần khi trang `/venues/[id]` mount. Server đọc `User-Agent` (phân loại mobile bằng regex đơn giản trên các từ khoá `Mobile|Android|iPhone`, không thêm thư viện parse UA mới) và JWT nếu có trong `Authorization` header (không bắt buộc, request ẩn danh vẫn hợp lệ) để gắn `userId`. `referrer` (raw URL hoặc rỗng) được phân loại phía server: rỗng → `direct`; chứa domain công cụ tìm kiếm (google/bing/yahoo/cốc cốc...) → `search`; chứa domain mạng xã hội (facebook/instagram/tiktok/zalo...) → `social`; còn lại → `other`.

`venueId` phải tồn tại và `venue.status = active` → 404 nếu không (tránh ghi rác cho venue không tồn tại/chưa duyệt).

### 3.2. Đọc số liệu (owner-facing, JWT role `owner`)

```
GET /analytics/page-views/summary?venueId=&from=YYYY-MM-DD&to=YYYY-MM-DD&compare=false
```

Scope venue giống Dashboard: `?venueId=` tuỳ chọn (404 nếu không thuộc owner), mặc định tổng hợp mọi venue owner sở hữu.

**Response:**

```jsonc
{
  "totalViews": 1240,
  "uniqueVisitors": 890,
  "loggedInViews": 210,
  "mobilePercent": 62.5,
  "viewsByDay": [{ "date": "2026-08-01", "views": 40 }],
  "previousPeriod": {                 // chỉ có khi ?compare=true
    "totalViews": 980,
    "viewsByDay": [{ "date": "2026-07-07", "views": 30 }]
  },
  "heatmap": [{ "dayOfWeek": 0, "hour": 18, "views": 25 }],  // đủ 168 ô (7 thứ x 24 giờ), ô không có view = 0
  "conversion": [
    { "venueId": "uuid", "venueName": "Sân ABC", "views": 500, "bookings": 45, "conversionRate": 9.0 }
  ],
  "topSources": [{ "source": "social", "views": 620, "percent": 50.0 }],
  "topVenues": [{ "venueId": "uuid", "venueName": "Sân ABC", "views": 500 }]
}
```

```
GET /analytics/page-views/export?venueId=&from=&to=
```

CSV của `viewsByDay` (cột: Ngày, Lượt xem), cùng quy ước file như Revenue Report export.

Các nút chọn khoảng dựng sẵn (7 ngày/30 ngày/90 ngày/Tháng này) là logic thuần frontend (tính `from`/`to` rồi gọi cùng API) — không cần tham số riêng ở backend.

## 4. Định nghĩa chi tiết

| Trường | Định nghĩa |
|---|---|
| `totalViews` | Tổng số dòng `page_views` có `created_at` trong `[from, to]`, thuộc phạm vi lọc. |
| `uniqueVisitors` | Số `visitor_id` phân biệt trong tập trên. |
| `loggedInViews` | Số dòng có `user_id IS NOT NULL` trong tập trên. |
| `mobilePercent` | `(số dòng is_mobile=true / totalViews) * 100`; trả `0` nếu `totalViews = 0`. |
| `viewsByDay` | Đếm theo `DATE(created_at)`, đủ mọi ngày trong `[from, to]` kể cả ngày 0 view. |
| `previousPeriod` | Cùng cách tính "kỳ trước" đã chốt ở Revenue Report §4 (cùng độ dài, liền trước `from`). Chỉ trả khi `compare=true` (mặc định `false` — không tính khi không cần, tránh query thừa). |
| `heatmap` | Đếm theo cặp (thứ trong tuần của `created_at`, giờ trong ngày của `created_at`) trong `[from, to]`, phạm vi lọc. `dayOfWeek`: 0=Chủ nhật..6=Thứ 7 (theo `EXTRACT(DOW FROM created_at)` của Postgres). |
| `conversion[].bookings` | Số `bookings` có `created_at` trong `[from, to]`, thuộc venue tương ứng — tính cả booking đã huỷ (nhất quán với "phát sinh trong kỳ" đã dùng ở `todayBookingsCount` của Dashboard, không phải "đang active"). |
| `conversion[].conversionRate` | `bookings / views * 100`; `0` nếu `views = 0`. Danh sách này chỉ có ý nghĩa khi không lọc theo 1 venue cụ thể (so sánh giữa các venue) — nếu có `?venueId=`, mảng chỉ có 1 phần tử. |
| `topSources` | Nhóm `referrer_source`, đếm + tính `%` trên `totalViews`. |
| `topVenues` | Nhóm theo `venue_id`, sắp giảm dần theo lượt xem — chỉ hữu ích khi không truyền `?venueId=`. |

## 5. Validation

- `POST /analytics/page-views`: public, không cần JWT hợp lệ để ghi nhận (JWT sai/hết hạn → coi như ẩn danh, không lỗi); `venueId` không tồn tại hoặc venue không `active` → 404.
- `GET /analytics/*`: role khác `owner` → 403; `from`/`to` bắt buộc, `from <= to` → 400 nếu sai; `venueId` không thuộc owner → 404.

## 6. Ngoài phạm vi

- Chống spam/bot cho endpoint ghi nhận (public, không xác thực, không rate-limit) — chấp nhận rủi ro dữ liệu bị làm giả ở MVP cá nhân, không xây chống-abuse.
- Merge danh tính khách xem đa thiết bị (chỉ đếm theo `visitor_id` thô).
- Bảng tổng hợp/rollup để tăng hiệu năng khi dữ liệu lớn (tính real-time mỗi request, giống Dashboard/Revenue Report).
- Phân loại nguồn traffic chi tiết hơn "direct/search/social/other" (không có UTM tracking, không phân biệt từng mạng xã hội cụ thể trong response).
- Retention/xoá dữ liệu `page_views` cũ.
- Frontend (spec riêng, sau khi spec API này được duyệt).
