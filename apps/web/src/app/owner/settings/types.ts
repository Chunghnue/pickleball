export type SettingsTab = "venue" | "hours" | "notifications" | "account";

export interface OperatingHourRow {
  dayOfWeek: number; // 0-6, 0 = Chủ Nhật
  isOpen: boolean;
  openTime: string | null; // "HH:mm"
  closeTime: string | null;
}

export interface NotificationSettings {
  newBooking: boolean;
  cancellation: boolean;
  payment: boolean;
  dailyReport: boolean;
}
