import { useState } from "react";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { avatarColor, avatarInitials, roleBadgeClasses, roleLabel } from "./staff-format";
import { StaffFormDialog } from "./staff-form-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { DeactivateStaffDialog } from "./deactivate-staff-dialog";
import type { StaffListItem } from "./types";

export function StaffTable({
  items,
  onSaved,
}: {
  items: StaffListItem[];
  onSaved: () => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Chưa có tài khoản nào.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <StaffRow key={item.id} item={item} onSaved={onSaved} />
      ))}
    </div>
  );
}

function StaffRow({ item, onSaved }: { item: StaffListItem; onSaved: () => void }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  return (
    <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-4">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColor(item.fullName)}`}
        >
          {avatarInitials(item.fullName)}
        </span>
        <div>
          <p className="font-semibold">{item.fullName}</p>
          <p className="text-sm text-muted-foreground">
            {item.phone ?? "—"}
            {item.email && <> · {item.email}</>}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {item.status === "suspended" && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Đã khoá
          </span>
        )}
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${roleBadgeClasses(item)}`}
        >
          {roleLabel(item)}
        </span>

        {item.role === "staff" ? (
          <div className="flex gap-1.5">
            <StaffFormDialog
              mode="edit"
              staff={item}
              onSaved={onSaved}
              trigger={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Sửa nhân viên"
                  className="text-muted-foreground hover:bg-muted"
                >
                  <Pencil className="size-3.5" />
                </Button>
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Đặt lại mật khẩu"
              onClick={() => setResetOpen(true)}
              className="border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
            >
              <KeyRound className="size-3.5" />
            </Button>
            <ResetPasswordDialog
              open={resetOpen}
              onOpenChange={setResetOpen}
              staffId={item.id}
              staffName={item.fullName}
            />
            {item.status !== "suspended" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Vô hiệu hoá"
                  onClick={() => setDeactivateOpen(true)}
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="size-3.5" />
                </Button>
                <DeactivateStaffDialog
                  open={deactivateOpen}
                  onOpenChange={setDeactivateOpen}
                  staffId={item.id}
                  staffName={item.fullName}
                  onSaved={onSaved}
                />
              </>
            )}
          </div>
        ) : (
          <span className="w-[72px] text-center text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
