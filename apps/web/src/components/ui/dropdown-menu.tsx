"use client";

import type { ComponentProps } from "react";
import { Menu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;

function DropdownMenuContent({
  className,
  sideOffset = 8,
  align = "end",
  ...props
}: ComponentProps<typeof Menu.Popup> &
  Pick<ComponentProps<typeof Menu.Positioner>, "sideOffset" | "align">) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={sideOffset} align={align} className="z-50 outline-none">
        <Menu.Popup
          className={cn(
            "min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-none",
            className,
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
