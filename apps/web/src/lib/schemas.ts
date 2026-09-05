import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  fullName: z.string().min(1, 'Vui lòng nhập họ tên'),
  phone: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Vui lòng nhập email hoặc số điện thoại'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Vui lòng nhập họ tên').optional(),
  phone: z.string().optional(),
  avatarUrl: z
    .string()
    .url('URL không hợp lệ')
    .optional()
    .or(z.literal('')),
  address: z.string().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const addVenueImageSchema = z.object({
  url: z.string().url('URL không hợp lệ'),
});
export type AddVenueImageInput = z.infer<typeof addVenueImageSchema>;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createCourtSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên sân'),
  pricePerHour: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0'),
  openTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  closeTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  slotDurationMinutes: z.coerce
    .number()
    .int('Phải là số nguyên')
    .min(15, 'Tối thiểu 15 phút')
    .max(240, 'Tối đa 240 phút'),
  description: z.string().optional(),
  capacity: z.coerce.number().int('Phải là số nguyên').min(1, 'Phải lớn hơn 0').optional(),
  displayOrder: z.coerce.number().int('Phải là số nguyên').optional(),
});
export type CreateCourtInput = z.infer<typeof createCourtSchema>;

export const courtStatusValues = ['active', 'maintenance', 'closed'] as const;

export const updateCourtSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên sân').optional(),
  pricePerHour: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0').optional(),
  openTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)')
    .optional(),
  closeTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)')
    .optional(),
  slotDurationMinutes: z.coerce
    .number()
    .int('Phải là số nguyên')
    .min(15, 'Tối thiểu 15 phút')
    .max(240, 'Tối đa 240 phút')
    .optional(),
  description: z.string().optional(),
  capacity: z.coerce.number().int('Phải là số nguyên').min(1, 'Phải lớn hơn 0').optional(),
  displayOrder: z.coerce.number().int('Phải là số nguyên').optional(),
  status: z.enum(courtStatusValues).optional(),
});
export type UpdateCourtInput = z.infer<typeof updateCourtSchema>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// z.coerce.number() turns an empty string into 0 (Number('') === 0), so an
// `.optional()` numeric field with a `.min()` above 0 rejects "left blank"
// as if the owner had typed 0. Preprocessing '' (and null) to undefined
// *before* coercion lets `.optional()` actually skip validation when empty.
function emptyToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((val) => (val === '' || val === null ? undefined : val), schema);
}

const pricingRuleBaseSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên khung giá'),
  daysOfWeek: z
    .array(z.coerce.number().int().min(0).max(6))
    .min(1, 'Chọn ít nhất 1 thứ áp dụng'),
  startTime: z.string().regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  endTime: z.string().regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  price: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0'),
  priority: emptyToUndefined(z.coerce.number().int('Phải là số nguyên').optional()),
  advanceBookingHours: emptyToUndefined(
    z.coerce.number().int('Phải là số nguyên').min(1, 'Tối thiểu 1 giờ').optional(),
  ),
  advancePrice: emptyToUndefined(z.coerce.number().min(0.01, 'Giá phải lớn hơn 0').optional()),
  validFrom: z
    .string()
    .regex(DATE_PATTERN, 'Định dạng ngày không hợp lệ')
    .optional()
    .or(z.literal('')),
  validTo: z
    .string()
    .regex(DATE_PATTERN, 'Định dạng ngày không hợp lệ')
    .optional()
    .or(z.literal('')),
});

export const createPricingRuleSchema = pricingRuleBaseSchema.refine(
  (data) => data.startTime < data.endTime,
  { message: 'Giờ bắt đầu phải trước giờ kết thúc', path: ['endTime'] },
);
export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = pricingRuleBaseSchema.partial().refine(
  (data) => !data.startTime || !data.endTime || data.startTime < data.endTime,
  { message: 'Giờ bắt đầu phải trước giờ kết thúc', path: ['endTime'] },
);
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>;

const recurringScheduleBaseSchema = z.object({
  courtId: z.string().min(1, 'Vui lòng chọn sân'),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  endTime: z.string().regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  pricePerSession: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0'),
  discountPercent: emptyToUndefined(z.coerce.number().min(0).max(100).optional()),
  validFrom: z.string().regex(DATE_PATTERN, 'Định dạng ngày không hợp lệ'),
  validTo: z.string().regex(DATE_PATTERN, 'Định dạng ngày không hợp lệ'),
  note: z.string().optional(),
  autoRenew: z.boolean().optional(),
});

export const createRecurringScheduleSchema = recurringScheduleBaseSchema
  .refine((data) => data.startTime < data.endTime, {
    message: 'Giờ bắt đầu phải trước giờ kết thúc',
    path: ['endTime'],
  })
  .refine((data) => data.validFrom <= data.validTo, {
    message: 'Từ ngày phải trước hoặc bằng đến ngày',
    path: ['validTo'],
  });
export type CreateRecurringScheduleInput = z.infer<typeof createRecurringScheduleSchema>;

export const updateRecurringScheduleSchema = z.object({
  pricePerSession: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0'),
  discountPercent: emptyToUndefined(z.coerce.number().min(0).max(100).optional()),
  validTo: z.string().regex(DATE_PATTERN, 'Định dạng ngày không hợp lệ'),
  note: z.string().optional(),
  autoRenew: z.boolean().optional(),
});
export type UpdateRecurringScheduleInput = z.infer<typeof updateRecurringScheduleSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
    newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu mới'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Xác nhận mật khẩu không khớp',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
