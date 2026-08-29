const WEEKDAYS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatHeaderDate(date: Date): string {
  const weekday = WEEKDAYS[date.getDay()];
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${weekday}, ${day}/${month}/${year}`;
}

export function formatHeaderTime(date: Date): string {
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `${hours}:${minutes}:${seconds}`;
}
