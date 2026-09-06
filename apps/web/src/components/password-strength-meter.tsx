import { cn } from "@/lib/utils";
import type { PasswordStrength } from "@/lib/password-strength";

const LEVEL_LABEL: Record<PasswordStrength, string> = {
  0: "",
  1: "Yếu — dùng chữ hoa, số và ký tự đặc biệt để tăng độ mạnh",
  2: "Trung bình",
  3: "Mạnh",
};

const LEVEL_COLOR: Record<PasswordStrength, string> = {
  0: "bg-muted",
  1: "bg-red-500",
  2: "bg-amber-500",
  3: "bg-green-500",
};

export function PasswordStrengthMeter({ strength }: { strength: PasswordStrength }) {
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3].map((segment) => (
          <div
            key={segment}
            className={cn(
              "h-1 flex-1 rounded-full",
              segment <= strength ? LEVEL_COLOR[strength] : "bg-muted",
            )}
          />
        ))}
      </div>
      {LEVEL_LABEL[strength] && (
        <p className="text-xs text-muted-foreground">{LEVEL_LABEL[strength]}</p>
      )}
    </div>
  );
}
