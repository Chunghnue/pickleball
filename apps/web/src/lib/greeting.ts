export function getGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 11) return 'Chào buổi sáng!';
  if (hour < 13) return 'Chào buổi trưa!';
  if (hour < 18) return 'Chào buổi chiều!';
  return 'Chào buổi tối!';
}
