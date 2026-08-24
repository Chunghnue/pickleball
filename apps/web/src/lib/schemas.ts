import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  fullName: z.string().min(1, 'Vui lòng nhập họ tên'),
  phone: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
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
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const createVenueSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên địa điểm'),
  address: z.string().min(1, 'Vui lòng nhập địa chỉ'),
  city: z.string().min(1, 'Vui lòng nhập thành phố'),
  description: z.string().optional(),
});
export type CreateVenueInput = z.infer<typeof createVenueSchema>;

export const updateVenueSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên địa điểm').optional(),
  address: z.string().min(1, 'Vui lòng nhập địa chỉ').optional(),
  city: z.string().min(1, 'Vui lòng nhập thành phố').optional(),
  description: z.string().optional(),
});
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;

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
});
export type CreateCourtInput = z.infer<typeof createCourtSchema>;

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
  isActive: z.boolean().optional(),
});
export type UpdateCourtInput = z.infer<typeof updateCourtSchema>;
