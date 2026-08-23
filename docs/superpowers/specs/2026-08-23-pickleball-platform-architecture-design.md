# Pickleball Court Booking Platform — Kiến trúc tổng thể

**Ngày:** 2026-08-23
**Trạng thái:** Chờ review

## 1. Mục tiêu & Bối cảnh

Xây dựng một nền tảng đặt sân pickleball tương tự [sanbong.vn](https://sanbong.vn) — một **marketplace hai phía**: nhiều chủ sân đăng ký và quản lý sân của họ trên hệ thống, khách hàng tìm kiếm và đặt sân trống.

Đây là dự án MVP/cá nhân, ưu tiên đơn giản, triển khai nhanh, dễ bảo trì một mình, nhưng vẫn giữ ranh giới module rõ ràng để có thể tách ra thành service riêng sau này nếu cần scale.

## 2. Phạm vi MVP

**Trong phạm vi:**
- Marketplace nhiều chủ sân (owner tự đăng ký, đăng sân, quản lý lịch/giá)
- Khách hàng tìm kiếm, xem, đặt sân theo khung giờ trống
- Xác thực bằng email + mật khẩu (JWT), 3 vai trò: customer / owner / admin
- Thanh toán thủ công (chủ sân xác nhận đã nhận tiền tại sân/chuyển khoản ngoài hệ thống — chưa tích hợp cổng thanh toán)
- Thông báo qua email (xác nhận đặt sân)
- Admin/backoffice: duyệt chủ sân/sân mới, xem thống kê cơ bản

**Ngoài phạm vi MVP (để sau):**
- Tích hợp cổng thanh toán online (VNPay/Momo)
- SMS/Zalo OA notification
- Đăng nhập qua số điện thoại/OTP, social login
- Tìm kiếm nâng cao theo bản đồ, đánh giá/review sân
- Tách microservices

## 3. Tech Stack

| Thành phần | Công nghệ |
|---|---|
| API | NestJS |
| Frontend | Next.js + Tailwind CSS |
| Database | PostgreSQL |
| Auth | JWT (email + password) |

## 4. Quyết định kiến trúc: Modular Monolith

**Hai hướng đã cân nhắc:**

| | Modular Monolith (chọn) | Microservices |
|---|---|---|
| Triển khai | 1 NestJS app, 1 Postgres DB, 1 Next.js app | Nhiều service độc lập, cần message broker, service discovery |
| Độ phức tạp | Thấp, phù hợp 1 người/nhóm nhỏ | Cao, overhead không cần thiết cho MVP |
| Khả năng mở rộng sau | Tốt — module tách biệt rõ ràng nên có thể bóc ra thành service riêng khi cần | Có sẵn nhưng phải trả giá phức tạp ngay từ đầu |

**Quyết định:** Modular Monolith — một NestJS API app duy nhất chia thành các module độc lập rõ ràng (giao tiếp nội bộ qua service interface, không qua HTTP/queue), một Next.js app duy nhất chia theo route (`/`, `/owner`, `/admin`), một Postgres database.

## 5. Sơ đồ kiến trúc

```
┌─────────────────────────────────────────┐
│  Next.js App (1 app, route-based)        │
│  /  (khách hàng)  /owner  (chủ sân)  /admin│
└───────────────┬───────────────────────────┘
                 │ REST API (JWT auth)
┌────────────────▼───────────────────────────┐
│  NestJS API (Modular Monolith)              │
│ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│ │   Auth   │ │  Users   │ │    Courts    │ │
│ │ (JWT,    │ │ (roles:  │ │ (chủ sân     │ │
│ │ email+pw)│ │ customer/│ │  đăng sân,   │ │
│ │          │ │ owner/   │ │  giá, giờ mở)│ │
│ │          │ │ admin)   │ │              │ │
│ └──────────┘ └──────────┘ └──────────────┘ │
│ ┌──────────────┐ ┌───────────┐ ┌─────────┐ │
│ │   Bookings   │ │ Payments  │ │  Admin  │ │
│ │ (lõi: giữ    │ │ (thủ công,│ │(duyệt   │ │
│ │  chỗ, tránh  │ │  tracking │ │ sân,    │ │
│ │  trùng lịch) │ │  trạng thái)│ │thống kê)│ │
│ └──────────────┘ └───────────┘ └─────────┘ │
│ ┌──────────────┐                            │
│ │Notifications │                            │
│ │ (email)      │                            │
│ └──────────────┘                            │
└────────────────┬─────────────────────────────┘
                 │
         ┌───────▼────────┐
         │   PostgreSQL    │
         └─────────────────┘
```

## 6. Các module (hệ thống con)

| Module | Trách nhiệm | Phụ thuộc vào |
|---|---|---|
| **Auth** | Đăng ký/đăng nhập email+password, cấp/verify JWT, phân quyền theo vai trò | Users |
| **Users** | Hồ sơ người dùng, vai trò (customer/owner/admin) | — |
| **Courts** | Chủ sân đăng ký sân, cấu hình khung giờ mở cửa & giá; khách tìm kiếm/xem sân | Users (owner) |
| **Bookings** | Lõi hệ thống — kiểm tra slot trống, giữ chỗ, tránh double-booking, quản lý trạng thái đặt sân | Courts, Users |
| **Payments** | Tracking trạng thái thanh toán thủ công; chủ sân xác nhận đã nhận tiền | Bookings |
| **Notifications** | Gửi email xác nhận đặt sân | Bookings |
| **Admin** | Duyệt chủ sân/sân mới, xem thống kê, xử lý vấn đề phát sinh | Users, Courts, Bookings |

Mỗi module là một NestJS module riêng, expose service interface rõ ràng cho các module khác gọi — không truy cập trực tiếp vào repository/entity của module khác.

## 7. Bước tiếp theo

Kiến trúc tổng thể này là nền tảng để brainstorm chi tiết từng module riêng (spec → plan → implementation). Thứ tự đề xuất triển khai:

1. **Auth + Users** — nền tảng cho mọi module khác
2. **Courts** — chủ sân đăng sân
3. **Bookings** — lõi đặt lịch (phần phức tạp nhất, cần thiết kế kỹ logic tránh trùng lịch)
4. **Payments** (thủ công) — đơn giản, gắn liền Bookings
5. **Notifications** (email) — đơn giản, gắn liền Bookings
6. **Admin** — sau khi các module trên đã có dữ liệu để quản lý
