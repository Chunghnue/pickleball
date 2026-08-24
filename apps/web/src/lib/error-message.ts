export function getSubmitErrorMessage(
  response: Response,
  data: { message?: string } | null,
): string {
  if (response.status === 429) {
    return 'Bạn đã thử quá nhiều lần, vui lòng thử lại sau.';
  }
  return data?.message ?? 'Có lỗi xảy ra, vui lòng thử lại.';
}
