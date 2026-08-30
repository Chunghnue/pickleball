"use client";

import { Select } from "@base-ui/react/select";
import { CheckCircle2, ChevronDown, Lock, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Court } from "./types";

const STATUS_OPTIONS: {
  value: Court["status"];
  label: string;
  icon: typeof CheckCircle2;
  iconClass: string;
}[] = [
  { value: "active", label: "Hoạt động", icon: CheckCircle2, iconClass: "text-green-600" },
  { value: "maintenance", label: "Bảo trì", icon: Wrench, iconClass: "text-amber-500" },
  { value: "closed", label: "Tạm đóng", icon: Lock, iconClass: "text-red-600" },
];

interface CourtStatusSelectProps {
  id?: string;
  value: Court["status"];
  onChange: (value: Court["status"]) => void;
  disabled?: boolean;
}

export function CourtStatusSelect({ id, value, onChange, disabled }: CourtStatusSelectProps) {
  const current = STATUS_OPTIONS.find((option) => option.value === value) ?? STATUS_OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <Select.Root
      value={value}
      onValueChange={(next) => onChange(next as Court["status"])}
      disabled={disabled}
    >
      <Select.Trigger
        id={id}
        className="flex h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex items-center gap-1.5">
          <CurrentIcon className={cn("size-3.5", current.iconClass)} />
          <Select.Value>{() => current.label}</Select.Value>
        </span>
        <Select.Icon>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="z-50 outline-none" sideOffset={4}>
          <Select.Popup className="w-[var(--anchor-width)] overflow-hidden rounded-lg border bg-popover py-1 shadow-lg outline-none">
            <Select.List>
              {STATUS_OPTIONS.map((option) => {
                const OptionIcon = option.icon;
                return (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted data-[selected]:bg-blue-600 data-[selected]:text-white"
                  >
                    <OptionIcon className={cn("size-3.5", option.iconClass)} />
                    <Select.ItemText>{option.label}</Select.ItemText>
                  </Select.Item>
                );
              })}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
