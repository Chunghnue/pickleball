# Module: Revenue Reports (Báo cáo doanh thu) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/06-bao-cao-doanh-thu.md](../../spec/06-bao-cao-doanh-thu.md) (khảo sát UI sanbong.vn thực tế)
**Dựa trên quyết định của:** [2026-08-25-dashboard-design.md](./2026-08-25-dashboard-design.md) (định nghĩa doanh thu, cách scope venue), [2026-08-26-customers-module-design.md](./2026-08-26-customers-module-design.md) (khách walk-in qua `customer_contacts`)

## 0. Cập nhật 2026-09-03 — đối chiếu lại với những gì đã build từ 2026-08-26

Spec này viết trước khi module Staff Accounts (`OwnerScopeGuard`/tier `operational|full|owner`) tồn tại, và trước khi xác nhận lại schema `payments` thực tế. 2 điểm sau **thay thế** nội dung tương ứng ở §4/§5 bên dưới, phần còn lại giữ nguyên:

- **Không có cột `payments.amount`** (bảng `payments` chỉ có `status`/`paidAt`/`note`/`paidBy`/`refundedAt`/`refundedBy`). Số tiền của một giao dịch luôn là `bookings.total_price` của booking gắn với payment đó (join `payment.booking_id = booking.id`) — đúng cách Dashboard (`dashboard.service.ts`) và Customers (`customers.service.ts`) đã làm. Mọi chỗ ghi "`payments.amount`" bên dưới đọc là "`bookings.total_price` của booking tương ứng payment đó".
- **Quyền truy cập dùng tier `operational`** (`@OwnerScope('operational')`), không phải "role owner → 403" thuần tuý — khớp với quyền của Dashboard: owner và mọi nhân viên (`manager`/`cashier`/`staff`) đều xem được. `EffectiveOwnerId` (không phải `userId` thô) dùng để scope venue, đúng pattern `DashboardController`.

## 1. Mục tiêu

Thống kê tài chính chi tiết theo khoảng thời gian tuỳ chọn: doanh thu kỳ này so với kỳ trước, biểu đồ doanh thu theo ngày, danh sách từng giao dịch, và xuất báo cáo ra file.

Module này **chỉ đọc** — không có bảng dữ liệu mới, tính hoàn toàn real-time từ `payments`/`bookings`/`courts`/`venues`/`users`/`customer_contacts` đã có. Không lưu snapshot báo cáo lịch sử.

## 2. Định nghĩa "giao dịch" và "doanh thu"

Nhất quán với Dashboard (§4 của spec Dashboard): một **giao dịch** = một dòng `payments` có `status = 'paid'`. `paidAt` là mốc thời gian dùng để lọc theo khoảng ngày.

**Giới hạn đã biết:** nếu một payment được refund sau đó, `status` chuyển thành `refunded` và dòng đó **biến mất khỏi báo cáo của mọi kỳ**, kể cả kỳ đã từng trả tiền trước đó — vì không có snapshot lịch sử, mọi thứ tính lại real-time theo trạng thái hiện tại. Đây là quyết định có chủ đích để giữ nhất quán với Dashboard, không phải thiếu sót (xem §6 Ngoài phạm vi).

## 3. API endpoints

Owner-facing (JWT, role `owner`), scope theo venue giống Dashboard: `?venueId=` tuỳ chọn (phải thuộc owner, 404 nếu không), mặc định tổng hợp tất cả venue của owner.

```
GET /reports/revenue?venueId=&from=YYYY-MM-DD&to=YYYY-MM-DD
```

**Response:**

```jsonc
{
  "currentPeriod": {
    "revenue": 15000000,
    "transactionCount": 42,
    "avgPerTransaction": 357142.86
  },
  "previousPeriod": { "revenue": 12000000 },
  "changeAmount": 3000000,       // currentPeriod.revenue - previousPeriod.revenue
  "changePercent": 25.0,         // null nếu previousPeriod.revenue = 0
  "revenueByDay": [
    { "date": "2026-08-01", "revenue": 500000 }
    // đủ mọi ngày trong [from, to], kể cả ngày revenue = 0
  ],
  "transactions": [
    {
      "id": "uuid",
      "transactionCode": "GD-3F9A2B1C",
      "customerName": "Nguyễn Văn A",
      "customerPhone": "0900000000",
      "paidAt": "2026-08-15T10:30:00Z",
      "amount": 250000,
      "status": "paid"
    }
    // sắp giảm dần theo paidAt, không phân trang ở MVP (xem §6)
  ]
}
```

```
GET /reports/revenue/export?venueId=&from=YYYY-MM-DD&to=YYYY-MM-DD
```

Trả về file CSV (`Content-Type: text/csv`, header `Content-Disposition: attachment`) với các cột: Mã GD, Khách hàng, SĐT, Thời gian, Số tiền, Trạng thái — đúng dữ liệu `transactions` ở trên, không kèm `currentPeriod`/`revenueByDay`.

## 4. Định nghĩa chi tiết

| Trường | Định nghĩa |
|---|---|
| `currentPeriod.revenue` | Tổng `payments.amount` với `status='paid'`, `paidAt` trong `[from, to]` (bao gồm cả hai đầu mút, theo ngày — `to` tính đến 23:59:59). |
| `currentPeriod.transactionCount` | Số dòng `payments` thoả điều kiện trên. |
| `currentPeriod.avgPerTransaction` | `revenue / transactionCount`; trả `0` nếu `transactionCount = 0` (không chia cho 0). |
| `previousPeriod` | Cùng độ dài ngày với `[from, to]`, kết thúc ngay trước `from`. VD `from=2026-08-01, to=2026-08-25` (25 ngày) → kỳ trước là `2026-07-07` đến `2026-07-31` (25 ngày). |
| `changePercent` | `(currentPeriod.revenue - previousPeriod.revenue) / previousPeriod.revenue * 100`; `null` nếu `previousPeriod.revenue = 0` (tránh chia cho 0, hiển thị "N/A" ở frontend thay vì `Infinity`/`NaN`). |
| `revenueByDay` | Tổng `payments.amount` (`status='paid'`) mỗi ngày trong `[from, to]`, nhóm theo `DATE(paidAt)`. Ngày không có giao dịch trả `revenue: 0`. |
| `transactions[].customerName/customerPhone` | Từ `users` nếu booking có `customerId`, ngược lại từ `customer_contacts` qua `customerContactId` (booking walk-in — xem spec Customers §4.3). |
| `transactions[].transactionCode` | `GD-` + 8 ký tự đầu của `payment.id` (UUID), viết hoa. |

## 5. Validation

- Chưa đăng nhập → 401; role/tier dưới `operational` (không phải owner/staff của venue) → 403 (xem §0).
- `from`/`to` bắt buộc, đúng định dạng `YYYY-MM-DD`, và `from <= to` → 400 nếu vi phạm.
- `venueId` (nếu có) không tồn tại → 404; tồn tại nhưng thuộc owner khác → 403 (đúng hành vi `VenuesService.getOwnedVenueOrThrow`, xem test Dashboard `dashboard.e2e-spec.ts`) — không phải 404 cho cả hai trường hợp như bản gốc ghi.
- Owner chưa có venue nào hoặc không có giao dịch nào trong kỳ → trả về số liệu = 0 / mảng rỗng, không lỗi.

## 6. Ngoài phạm vi

- Xuất PDF/Excel có định dạng — chỉ CSV thô ở MVP.
- Giới hạn độ dài tối đa của khoảng `[from, to]` — chưa cần vì quy mô dữ liệu MVP còn nhỏ; cân nhắc lại nếu ảnh hưởng hiệu năng.
- Phân trang danh sách giao dịch — MVP trả toàn bộ, giống cách các danh sách khác trong hệ thống hiện chưa phân trang.
- Lưu snapshot báo cáo lịch sử (báo cáo một kỳ đã qua sẽ đổi nếu có payment bị refund sau đó — xem giới hạn ở §2).
- Bộ lọc theo phương thức thanh toán — hệ thống chỉ có xác nhận thủ công (paid/unpaid/refunded), không có khái niệm "phương thức" (tiền mặt/chuyển khoản) trong schema hiện tại.
- Frontend (spec riêng, sau khi spec API này được duyệt).
