import { Test, TestingModule } from '@nestjs/testing';
import { DailyReportScheduler } from './daily-report.scheduler';
import { NotificationSettingsService } from './notification-settings.service';
import { UsersService } from '../users/users.service';
import { VenuesService } from '../courts/venues.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole, UserStatus } from '../users/entities/user.entity';

const mockNotificationSettingsService = () => ({ getForOwner: jest.fn() });
const mockUsersService = () => ({ findActiveOwners: jest.fn() });
const mockVenuesService = () => ({ findMineByOwner: jest.fn() });
const mockDashboardService = () => ({ getSummary: jest.fn() });
const mockNotificationsService = () => ({ notifyDailyReport: jest.fn().mockResolvedValue(undefined) });

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DailyReportScheduler,
      { provide: NotificationSettingsService, useFactory: mockNotificationSettingsService },
      { provide: UsersService, useFactory: mockUsersService },
      { provide: VenuesService, useFactory: mockVenuesService },
      { provide: DashboardService, useFactory: mockDashboardService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
    ],
  }).compile();

  return {
    scheduler: module.get(DailyReportScheduler),
    notificationSettingsService: module.get(NotificationSettingsService) as ReturnType<
      typeof mockNotificationSettingsService
    >,
    usersService: module.get(UsersService) as ReturnType<typeof mockUsersService>,
    venuesService: module.get(VenuesService) as ReturnType<typeof mockVenuesService>,
    dashboardService: module.get(DashboardService) as ReturnType<typeof mockDashboardService>,
    notificationsService: module.get(NotificationsService) as ReturnType<typeof mockNotificationsService>,
  };
}

describe('DailyReportScheduler.sendDailyReports', () => {
  it('sends a report for an active owner with dailyReport on and at least one venue', async () => {
    const {
      scheduler,
      notificationSettingsService,
      usersService,
      venuesService,
      dashboardService,
      notificationsService,
    } = await buildTestingModule();
    usersService.findActiveOwners.mockResolvedValue([
      { id: 'owner-1', email: 'owner1@test.com', role: UserRole.OWNER, status: UserStatus.ACTIVE },
    ]);
    notificationSettingsService.getForOwner.mockResolvedValue({
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
    venuesService.findMineByOwner.mockResolvedValue([{ id: 'venue-1' }]);
    dashboardService.getSummary.mockResolvedValue({
      todayBookingsCount: 3,
      todayRevenue: 300000,
    });

    await scheduler.sendDailyReports();

    expect(notificationsService.notifyDailyReport).toHaveBeenCalledWith({
      to: 'owner1@test.com',
      bookingsCount: 3,
      revenue: 300000,
    });
  });

  it('skips owners with dailyReport off', async () => {
    const { scheduler, notificationSettingsService, usersService, venuesService, notificationsService } =
      await buildTestingModule();
    usersService.findActiveOwners.mockResolvedValue([
      { id: 'owner-1', email: 'owner1@test.com', role: UserRole.OWNER, status: UserStatus.ACTIVE },
    ]);
    notificationSettingsService.getForOwner.mockResolvedValue({
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: false,
    });

    await scheduler.sendDailyReports();

    expect(venuesService.findMineByOwner).not.toHaveBeenCalled();
    expect(notificationsService.notifyDailyReport).not.toHaveBeenCalled();
  });

  it('skips owners with zero venues', async () => {
    const {
      scheduler,
      notificationSettingsService,
      usersService,
      venuesService,
      dashboardService,
      notificationsService,
    } = await buildTestingModule();
    usersService.findActiveOwners.mockResolvedValue([
      { id: 'owner-1', email: 'owner1@test.com', role: UserRole.OWNER, status: UserStatus.ACTIVE },
    ]);
    notificationSettingsService.getForOwner.mockResolvedValue({
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
    venuesService.findMineByOwner.mockResolvedValue([]);

    await scheduler.sendDailyReports();

    expect(dashboardService.getSummary).not.toHaveBeenCalled();
    expect(notificationsService.notifyDailyReport).not.toHaveBeenCalled();
  });
});
