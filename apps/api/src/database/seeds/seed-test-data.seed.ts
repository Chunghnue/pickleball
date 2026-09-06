import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../../config/data-source';
import { User, UserRole, UserStatus, StaffRole } from '../../users/entities/user.entity';
import { Venue, VenueStatus } from '../../courts/entities/venue.entity';
import { VenueOperatingHours } from '../../courts/entities/venue-operating-hours.entity';
import { Court, CourtStatus } from '../../courts/entities/court.entity';
import { PricingRule } from '../../pricing/entities/pricing-rule.entity';
import { CustomerContact } from '../../customer-contacts/entities/customer-contact.entity';
import { Booking, BookingStatus } from '../../bookings/entities/booking.entity';
import { BookingSlot } from '../../bookings/entities/booking-slot.entity';
import { Payment, PaymentStatus } from '../../payments/entities/payment.entity';
import { NotificationSettings } from '../../notification-settings/entities/notification-settings.entity';
import { generateBookingSlotStarts } from '../../bookings/booking-slot-generator';
import { PageView } from '../../page-views/entities/page-view.entity';
import { classifySource, detectIsMobile } from '../../page-views/page-view.utils';
import { BlogPost, BlogCategory } from '../../blog/entities/blog-post.entity';
import { computeReadingMinutes } from '../../blog/reading-time.util';

const PASSWORD = 'Test@123456';

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function upsertUser(
  repo: ReturnType<typeof AppDataSource.getRepository<User>>,
  data: Partial<User> & { email: string },
): Promise<User> {
  const existing = await repo.findOne({ where: { email: data.email } });
  if (existing) {
    console.log(`User ${data.email} already exists, skipping.`);
    return existing;
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = repo.create({
    passwordHash,
    emailVerified: true,
    status: UserStatus.ACTIVE,
    ...data,
  });
  await repo.save(user);
  console.log(`User ${data.email} created.`);
  return user;
}

async function run() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const venueRepo = AppDataSource.getRepository(Venue);
  const hoursRepo = AppDataSource.getRepository(VenueOperatingHours);
  const courtRepo = AppDataSource.getRepository(Court);
  const pricingRepo = AppDataSource.getRepository(PricingRule);
  const contactRepo = AppDataSource.getRepository(CustomerContact);
  const bookingRepo = AppDataSource.getRepository(Booking);
  const slotRepo = AppDataSource.getRepository(BookingSlot);
  const paymentRepo = AppDataSource.getRepository(Payment);
  const notifRepo = AppDataSource.getRepository(NotificationSettings);
  const pageViewRepo = AppDataSource.getRepository(PageView);
  const blogPostRepo = AppDataSource.getRepository(BlogPost);

  // --- Users ---
  const admin = await upsertUser(userRepo, {
    email: 'admin@pickleball.local',
    fullName: 'Admin',
    role: UserRole.ADMIN,
  });

  const owner = await upsertUser(userRepo, {
    email: 'owner@pickleball.local',
    fullName: 'Chủ sân Nguyễn Văn Chủ',
    phone: '0900000000',
    role: UserRole.OWNER,
  });

  const staff = await upsertUser(userRepo, {
    email: 'staff@pickleball.local',
    fullName: 'Nhân viên Trần Thị Nhân',
    phone: '0900000010',
    role: UserRole.STAFF,
    ownerId: owner.id,
    staffRole: StaffRole.MANAGER,
  });

  const customer1 = await upsertUser(userRepo, {
    email: 'customer1@pickleball.local',
    fullName: 'Khách hàng Lê Văn Khách',
    phone: '0900000020',
    role: UserRole.CUSTOMER,
  });

  const customer2 = await upsertUser(userRepo, {
    email: 'customer2@pickleball.local',
    fullName: 'Khách hàng Phạm Thị Hàng',
    phone: '0900000021',
    role: UserRole.CUSTOMER,
  });

  // --- Venue ---
  let venue = await venueRepo.findOne({ where: { slug: 'pickleball-quan-1' } });
  if (!venue) {
    venue = venueRepo.create({
      ownerId: owner.id,
      name: 'Pickleball Quận 1',
      address: '123 Nguyễn Huệ',
      city: 'Hồ Chí Minh',
      description: 'Sân pickleball trong nhà, 3 sân tiêu chuẩn thi đấu.',
      status: VenueStatus.ACTIVE,
      cancellationCutoffHours: 2,
      isDefault: true,
      phone: '0900000001',
      slug: 'pickleball-quan-1',
      district: 'Quận 1',
      latitude: 10.7769,
      longitude: 106.7009,
      email: 'venue@pickleball.local',
    });
    await venueRepo.save(venue);
    console.log(`Venue ${venue.name} created.`);

    const hours = Array.from({ length: 7 }, (_, dayOfWeek) =>
      hoursRepo.create({
        venueId: venue!.id,
        dayOfWeek,
        isOpen: true,
        openTime: '06:00',
        closeTime: '22:00',
      }),
    );
    await hoursRepo.save(hours);

    await notifRepo.save(
      notifRepo.create({
        ownerId: owner.id,
        newBooking: true,
        cancellation: true,
        payment: true,
        dailyReport: true,
      }),
    );
  } else {
    console.log(`Venue ${venue.name} already exists, skipping.`);
  }

  // --- Courts ---
  const courtNames = ['Sân 1', 'Sân 2', 'Sân 3'];
  const courts: Court[] = [];
  for (const [index, name] of courtNames.entries()) {
    let court = await courtRepo.findOne({ where: { venueId: venue.id, name } });
    if (!court) {
      court = courtRepo.create({
        venueId: venue.id,
        name,
        pricePerHour: 150000,
        openTime: '06:00',
        closeTime: '22:00',
        slotDurationMinutes: 60,
        status: CourtStatus.ACTIVE,
        capacity: 4,
        displayOrder: index,
      });
      await courtRepo.save(court);
      console.log(`Court ${name} created.`);

      await pricingRepo.save(
        pricingRepo.create({
          courtId: court.id,
          name: 'Giờ cao điểm (17:00-22:00)',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startTime: '17:00',
          endTime: '22:00',
          price: 200000,
          priority: 1,
        }),
      );
    } else {
      console.log(`Court ${name} already exists, skipping.`);
    }
    courts.push(court);
  }

  // --- Customer contact (guest) ---
  let guestContact = await contactRepo.findOne({
    where: { ownerId: owner.id, phone: '0900000099' },
  });
  if (!guestContact) {
    guestContact = contactRepo.create({
      ownerId: owner.id,
      fullName: 'Khách vãng lai Đỗ Văn Vãng',
      phone: '0900000099',
      email: 'guest@pickleball.local',
    });
    await contactRepo.save(guestContact);
    console.log('Guest contact created.');
  }

  // --- Bookings ---
  const today = new Date();

  async function createBooking(opts: {
    court: Court;
    date: string;
    startTime: string;
    endTime: string;
    customerId?: string;
    customerContactId?: string;
    contactName?: string;
    contactPhone?: string;
    status: BookingStatus;
    paymentStatus?: PaymentStatus;
    cancelled?: boolean;
  }) {
    const existing = await bookingRepo.findOne({
      where: {
        courtId: opts.court.id,
        date: opts.date,
        startTime: opts.startTime as unknown as string,
      },
    });
    if (existing) {
      console.log(`Booking on ${opts.date} ${opts.startTime} already exists, skipping.`);
      return;
    }

    const totalPrice =
      generateBookingSlotStarts(opts.startTime, opts.endTime, {
        openTime: opts.court.openTime,
        closeTime: opts.court.closeTime,
        slotDurationMinutes: opts.court.slotDurationMinutes,
      })?.length ?? 1;

    const booking = bookingRepo.create({
      courtId: opts.court.id,
      customerId: opts.customerId ?? null,
      customerContactId: opts.customerContactId ?? null,
      date: opts.date,
      startTime: opts.startTime,
      endTime: opts.endTime,
      totalPrice: totalPrice * opts.court.pricePerHour,
      status: opts.status,
      contactName: opts.contactName ?? null,
      contactPhone: opts.contactPhone ?? null,
      cancelledAt: opts.cancelled ? new Date() : null,
      cancelledBy: opts.cancelled ? (opts.customerId ?? 'owner') : null,
    });
    await bookingRepo.save(booking);

    if (opts.status !== BookingStatus.CANCELLED) {
      const starts =
        generateBookingSlotStarts(opts.startTime, opts.endTime, {
          openTime: opts.court.openTime,
          closeTime: opts.court.closeTime,
          slotDurationMinutes: opts.court.slotDurationMinutes,
        }) ?? [];
      await slotRepo.save(
        starts.map((slotStart) =>
          slotRepo.create({
            bookingId: booking.id,
            courtId: opts.court.id,
            date: opts.date,
            slotStart,
          }),
        ),
      );
    }

    if (opts.paymentStatus) {
      await paymentRepo.save(
        paymentRepo.create({
          bookingId: booking.id,
          status: opts.paymentStatus,
          paidAt: opts.paymentStatus === PaymentStatus.PAID ? new Date() : null,
        }),
      );
    }

    console.log(`Booking on ${opts.date} ${opts.startTime}-${opts.endTime} (${opts.status}) created.`);
  }

  // Past, completed & paid
  await createBooking({
    court: courts[0],
    date: addDays(today, -7),
    startTime: '07:00',
    endTime: '08:00',
    customerId: customer1.id,
    status: BookingStatus.COMPLETED,
    paymentStatus: PaymentStatus.PAID,
  });

  // Today, confirmed & paid (peak price)
  await createBooking({
    court: courts[2],
    date: addDays(today, 0),
    startTime: '20:00',
    endTime: '21:00',
    customerId: customer1.id,
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.PAID,
  });

  // Upcoming, confirmed & unpaid (peak price)
  await createBooking({
    court: courts[1],
    date: addDays(today, 2),
    startTime: '18:00',
    endTime: '19:00',
    customerId: customer2.id,
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
  });

  // Upcoming, guest booking, confirmed & unpaid
  await createBooking({
    court: courts[0],
    date: addDays(today, 3),
    startTime: '09:00',
    endTime: '10:00',
    customerContactId: guestContact.id,
    contactName: guestContact.fullName,
    contactPhone: guestContact.phone,
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
  });

  // Upcoming, cancelled
  await createBooking({
    court: courts[0],
    date: addDays(today, 1),
    startTime: '09:00',
    endTime: '10:00',
    customerId: customer1.id,
    status: BookingStatus.CANCELLED,
    cancelled: true,
  });

  // --- Page views (last 30 days, for the Lượt xem trang report) ---
  const existingPageViews = await pageViewRepo.count({ where: { venueId: venue.id } });
  if (existingPageViews === 0) {
    const referrers: (string | null)[] = [
      null,
      null,
      'https://www.facebook.com/',
      'https://www.google.com/search?q=pickleball+quan+1',
      'https://some-sports-blog.vn/review-san-pickleball',
    ];
    const userAgents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    ];
    const pageViews = Array.from({ length: 60 }, (_, i) => {
      const isPeakHour = Math.random() < 0.4;
      const hour = isPeakHour ? 18 + Math.floor(Math.random() * 4) : Math.floor(Math.random() * 24);
      const createdAt = new Date(today);
      createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 29));
      createdAt.setHours(hour, Math.floor(Math.random() * 60), 0, 0);

      const referrer = referrers[Math.floor(Math.random() * referrers.length)];
      const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
      const isLoggedIn = Math.random() < 0.25;

      return pageViewRepo.create({
        venueId: venue!.id,
        visitorId: `seed-visitor-${i % 15}`,
        userId: isLoggedIn ? customer1.id : null,
        path: `/venues/${venue!.id}`,
        referrer,
        source: classifySource(referrer),
        isMobile: detectIsMobile(userAgent),
        createdAt,
      });
    });
    await pageViewRepo.save(pageViews);
    console.log(`${pageViews.length} page views created.`);
  } else {
    console.log('Page views already exist, skipping.');
  }

  // --- Blog posts (for the public /blog page) ---
  const blogSeeds: {
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    category: BlogCategory;
    daysAgo: number;
  }[] = [
    {
      slug: 'phan-mem-quan-ly-san-bong-tot-nhat-2025',
      title: 'Phần mềm quản lý sân bóng tốt nhất 2025',
      excerpt: 'So sánh các phần mềm quản lý sân bóng phổ biến nhất hiện nay và tiêu chí lựa chọn phù hợp.',
      content: Array(20).fill('Nội dung chi tiết so sánh các phần mềm quản lý sân bóng, tiêu chí đánh giá, và gợi ý lựa chọn cho từng quy mô sân.').join(' '),
      category: BlogCategory.PHAN_MEM,
      daysAgo: 3,
    },
    {
      slug: 'huong-dan-mo-san-pickleball-tu-a-den-z',
      title: 'Hướng dẫn mở sân pickleball từ A đến Z',
      excerpt: 'Các bước cần chuẩn bị để mở một sân pickleball, từ mặt bằng, chi phí đến vận hành.',
      content: Array(20).fill('Nội dung hướng dẫn chi tiết từng bước mở sân pickleball, chi phí đầu tư, và kinh nghiệm vận hành thực tế.').join(' '),
      category: BlogCategory.HUONG_DAN,
      daysAgo: 7,
    },
    {
      slug: 'cach-quan-ly-san-bong-hieu-qua-tang-doanh-thu',
      title: 'Cách quản lý sân bóng hiệu quả tăng doanh thu',
      excerpt: 'Những chiến lược quản lý giúp chủ sân tối ưu công suất sử dụng và tăng doanh thu.',
      content: Array(20).fill('Nội dung phân tích các chiến lược kinh doanh, tối ưu giá thuê sân, và giữ chân khách hàng thân thiết.').join(' '),
      category: BlogCategory.KINH_DOANH,
      daysAgo: 12,
    },
    {
      slug: 'xu-huong-san-pickleball-viet-nam-2025',
      title: 'Xu hướng sân pickleball Việt Nam 2025',
      excerpt: 'Pickleball đang phát triển nhanh chóng tại Việt Nam — những xu hướng đáng chú ý trong năm 2025.',
      content: Array(20).fill('Nội dung phân tích tốc độ tăng trưởng của pickleball tại Việt Nam và dự báo xu hướng năm tới.').join(' '),
      category: BlogCategory.XU_HUONG,
      daysAgo: 20,
    },
    {
      slug: 'cach-tinh-gia-thue-san-bong-da',
      title: 'Cách tính giá thuê sân bóng đá',
      excerpt: 'Hướng dẫn xây dựng bảng giá thuê sân bóng đá hợp lý theo khung giờ và ngày trong tuần.',
      content: Array(20).fill('Nội dung hướng dẫn xây dựng bảng giá theo khung giờ cao điểm, ngày thường/cuối tuần, và ưu đãi khách quen.').join(' '),
      category: BlogCategory.HUONG_DAN,
      daysAgo: 30,
    },
  ];

  for (const seed of blogSeeds) {
    const existing = await blogPostRepo.findOne({ where: { slug: seed.slug } });
    if (existing) {
      console.log(`Blog post ${seed.slug} already exists, skipping.`);
      continue;
    }
    const publishedAt = new Date(today);
    publishedAt.setDate(publishedAt.getDate() - seed.daysAgo);
    await blogPostRepo.save(
      blogPostRepo.create({
        slug: seed.slug,
        title: seed.title,
        excerpt: seed.excerpt,
        content: seed.content,
        category: seed.category,
        readingMinutes: computeReadingMinutes(seed.content),
        publishedAt,
      }),
    );
    console.log(`Blog post ${seed.slug} created.`);
  }

  await AppDataSource.destroy();

  console.log('\n=== Seed complete ===');
  console.log(`Common password for all seeded users: ${PASSWORD}`);
  console.log(`  Admin:     ${admin.email}`);
  console.log(`  Owner:     ${owner.email}`);
  console.log(`  Staff:     ${staff.email}`);
  console.log(`  Customer1: ${customer1.email}`);
  console.log(`  Customer2: ${customer2.email}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
