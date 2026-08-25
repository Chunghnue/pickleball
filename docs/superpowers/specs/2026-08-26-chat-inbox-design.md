# Module: Chat Inbox (Hộp thư chat với khách hàng) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/11-hop-thu-chat.md](../../spec/11-hop-thu-chat.md) (khảo sát UI sanbong.vn thực tế)

## 1. Mục tiêu

Kênh nhắn tin giữa customer (đã đăng nhập) và owner, tích hợp trên mọi trang qua nút nổi "Tin nhắn". Đây là tính năng **realtime đầu tiên** của hệ thống — mọi module trước đều là REST thuần qua BFF.

**Ràng buộc phải tôn trọng:** kiến trúc frontend đã chốt "trình duyệt không bao giờ gọi thẳng NestJS, không bao giờ thấy raw token" ([2026-08-24-auth-users-frontend-design.md](./2026-08-24-auth-users-frontend-design.md) §2) — access token là **httpOnly cookie trên domain Next.js**. WebSocket cần một cơ chế riêng để xác thực mà không phá vỡ ràng buộc này (xem §3).

## 2. Data model

**conversations**

| Trường | Mô tả |
|---|---|
| id | UUID |
| owner_id | → users (chủ hội thoại phía owner) |
| customer_id | → users (khách, luôn role `customer`) |
| venue_id | nullable → venues — venue khách bắt đầu chat từ đó, chỉ để hiển thị ngữ cảnh, không dùng để tách hội thoại |
| assigned_to | nullable → users — người phụ trách xử lý (xem §7, chưa có UI lọc) |
| status | `open` \| `closed` |
| owner_last_read_at | nullable timestamp |
| customer_last_read_at | nullable timestamp |
| created_at, updated_at | |

**Unique index:** `(owner_id, customer_id)` — một cặp owner-customer chỉ có đúng 1 hội thoại xuyên suốt (không tạo hội thoại mới mỗi lần khách nhắn từ venue khác nhau của cùng owner; "đóng" chỉ là trạng thái triage, không tạo thread mới khi mở lại).

**messages**

| Trường | Mô tả |
|---|---|
| id | UUID |
| conversation_id | → conversations, `ON DELETE CASCADE` |
| sender_id | → users (người gửi — customer hoặc owner/người được `assigned_to`) |
| body | TEXT, tối đa 2000 ký tự |
| created_at | |

Không có bảng "đã đọc từng tin nhắn" — trạng thái chưa đọc tính ở cấp hội thoại (`owner_last_read_at`/`customer_last_read_at` so với `MAX(messages.created_at)` của hội thoại đó), đơn giản hơn read-receipt từng tin nhắn và đủ cho nhu cầu "Chưa đọc" ở bộ lọc.

## 3. Xác thực WebSocket qua ticket một lần

NestJS Gateway mới (`@nestjs/websockets` + `socket.io`, namespace `/chat`) — thành phần realtime đầu tiên của hệ thống, cần thêm 2 dependency mới.

**Vấn đề:** browser không có raw JWT để tự đính kèm khi mở kết nối WebSocket thẳng tới NestJS.

**Giải pháp — ticket một lần dùng:**

```
POST /api/chat/socket-ticket    (Next.js route handler, có cookie access_token sẵn)
  → proxy sang NestJS: POST /chat/socket-ticket  (Bearer đính kèm từ cookie, giống mọi route khác)
  → NestJS sinh ticket (32 byte random hex), lưu Map<ticket, {userId, role, expiresAt}> trong bộ nhớ tiến trình, TTL 30 giây
  → trả { ticket } (JSON thường, không phải cookie — an toàn để browser thấy vì ticket dùng 1 lần, hết hạn sau 30s, không phải JWT thật)
```

Browser: `io('wss://<api-host>/chat', { auth: { ticket } })` — **đây là ngoại lệ duy nhất** cho quy tắc "browser không gọi thẳng NestJS", áp dụng riêng cho transport WebSocket của chat; việc lấy ticket vẫn đi qua BFF như bình thường.

Gateway `handleConnection`: đọc `ticket` từ `socket.handshake.auth`, tra Map — không tồn tại/hết hạn → `disconnect()` ngay; hợp lệ → xoá khỏi Map (dùng 1 lần), gắn `{ userId, role }` vào `socket.data`, cho socket join room `owner:<ownerId>` nếu role `owner` (để nhận cập nhật mọi hội thoại của mình mà không cần mở từng hội thoại).

## 4. WebSocket events

**Client → Server:**
```
join_conversation { conversationId }   // server kiểm tra socket.data.userId là customer_id hoặc owner_id của hội thoại trước khi cho join room
send_message { conversationId, body }
mark_read { conversationId }
```

**Server → Client** (broadcast vào room `conversation:<id>`, và `owner:<ownerId>` cho các sự kiện ảnh hưởng tới danh sách hội thoại):
```
message_received { conversationId, message: { id, senderId, body, createdAt } }
conversation_updated { conversationId, lastMessageAt, status }
```

`send_message`: validate `body` không rỗng/≤2000 ký tự và `socket.data.userId` là 1 trong 2 phía hội thoại → insert `messages`, cập nhật `conversations.updated_at`, broadcast `message_received` vào `conversation:<id>` và `conversation_updated` vào `owner:<ownerId>` (để cập nhật danh sách hội thoại ngay cả khi owner chưa mở đúng hội thoại đó).

## 5. REST endpoints (tải lần đầu, tìm kiếm, và fallback khi socket rớt)

**Customer-facing** (JWT, role `customer`):
```
POST /chat/conversations                    body: { venueId } — lấy hội thoại có sẵn với owner của venue đó, hoặc tạo mới nếu chưa có
GET  /chat/conversations/mine               danh sách hội thoại của tôi (với các owner khác nhau)
GET  /chat/conversations/:id/messages       lịch sử tin nhắn (mới nhất trước, không phân trang ở MVP)
POST /chat/conversations/:id/messages       gửi tin nhắn qua REST (dùng khi socket rớt; cùng logic với send_message)
POST /chat/conversations/:id/read           đánh dấu đã đọc (cập nhật customer_last_read_at)
```

**Owner-facing** (JWT, role `owner`):
```
GET  /chat/conversations?status=&search=    hộp thư của tôi; search khớp tên/SĐT khách (join users) hoặc nội dung tin nhắn (LIKE)
GET  /chat/conversations/:id/messages
POST /chat/conversations/:id/messages
POST /chat/conversations/:id/close
POST /chat/conversations/:id/reopen
POST /chat/conversations/:id/assign         body: { assignedTo: userId | null } — xem §7
POST /chat/conversations/:id/read
```

**Chung cả 2 phía:**
```
POST /chat/socket-ticket                    cấp ticket kết nối WebSocket (xem §3)
```

## 6. Validation

- Customer/owner chỉ thao tác trên hội thoại mình là 1 trong 2 phía (`customer_id`/`owner_id`/`assigned_to`) → 403 nếu không.
- `POST /chat/conversations`: `venueId` phải tồn tại và `venue.status = active` → 404 nếu không.
- `body` tin nhắn không rỗng, tối đa 2000 ký tự → 400.
- `assign`: `assignedTo` (nếu khác null) phải là chính owner đang gọi → 400 nếu khác (chưa có nhân viên khác trong hệ thống, xem §7).
- WS: ticket không hợp lệ/hết hạn → disconnect ngay, không có thông báo lỗi chi tiết (tránh lộ thông tin).

## 7. Gán người phụ trách (assigned_to) — nền tảng cho sau này

Hệ thống hiện chỉ có 3 role (`customer`/`owner`/`admin`), chưa có khái niệm nhân viên — nên field `assigned_to` và endpoint `assign` được thêm sẵn vào schema/API ngay từ module này (tránh phải migrate schema lần nữa sau), nhưng **validation ở MVP này chỉ cho phép gán cho chính owner** (giá trị khả dĩ duy nhất). Bộ lọc "Của tôi"/"Chưa phân" ở UI **không** làm ở spec này — không có ý nghĩa khi chỉ có 1 người khả dĩ. Sẽ mở khoá đầy đủ khi module Tài khoản (nhân viên) được thiết kế.

## 8. Testing

- **Unit:** ticket TTL đúng 30s và chỉ dùng được 1 lần; tính "chưa đọc" đúng theo `*_last_read_at` so với tin nhắn mới nhất.
- **Integration:** 2 socket client cùng join 1 `conversation:<id>` — client A gửi `send_message`, client B nhận đúng `message_received`; ticket hết hạn/sai bị disconnect ngay khi connect.
- **E2E:** customer tạo hội thoại từ 1 venue → gửi tin nhắn → xuất hiện ở `GET /chat/conversations` (owner) → owner trả lời qua REST → customer thấy tin nhắn ở `GET /chat/conversations/:id/messages`; đóng/mở lại hội thoại không tạo thread mới (unique index `(owner_id, customer_id)` giữ nguyên).

## 9. Ngoài phạm vi

- Bộ lọc "Của tôi"/"Chưa phân" ở UI (endpoint `assign` có sẵn nhưng chưa hữu ích cho tới khi có module Tài khoản với nhiều nhân viên).
- Đính kèm file/ảnh trong tin nhắn.
- Push notification khi có tin nhắn mới lúc không mở app.
- Typing indicator, read-receipt theo từng tin nhắn (chỉ có "đã đọc tới đâu" cấp hội thoại).
- Chat ẩn danh — bắt buộc customer đăng nhập để bắt đầu hội thoại, không tạo thêm hệ danh tính ẩn danh mới (khác với Page View Analytics, vốn cần visitor ẩn danh vì bản chất là đo lưu lượng truy cập công khai).
- Chạy nhiều instance NestJS đồng thời — ticket lưu in-memory một tiến trình duy nhất, không dùng Redis pub/sub cho phòng WS. Chỉ chạy 1 instance ở MVP.
- Phím tắt J/K/R//Esc — thuần frontend, không cần backend.
- Phân trang lịch sử tin nhắn (MVP trả toàn bộ, giống các danh sách khác trong hệ thống).
- Frontend (spec riêng, sau khi spec API này được duyệt).
