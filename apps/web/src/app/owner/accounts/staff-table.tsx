import { useState } from "react";
import { Ban, KeyRound, Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { avatarColor, avatarInitials, roleBadgeClasses, roleLabel } from "./staff-format";
import { StaffFormDialog } from "./staff-form-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { DeactivateStaffDialog } from "./deactivate-staff-dialog";
import type { AccountStatus, StaffListItem } from "./types";

const STATUS_META: Record<AccountStatus, { label: string; cls: string }> = {
  active: {
    label: "Hoạt động",
    cls: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  },
  suspended: {
    label: "Đã khoá",
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  pending_verification: {
    label: "Chờ xác thực",
    cls: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  },
  pending_approval: {
    label: "Chờ duyệt",
    cls: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  },
  rejected: {
    label: "Bị từ chối",
    cls: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  },
};

export function StaffTable({
  items,
  onSaved,
}: {
  items: StaffListItem[];
  onSaved: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>TÀI KHOẢN</TableHead>
              <TableHead>SĐT</TableHead>
              <TableHead>EMAIL</TableHead>
              <TableHead>VAI TRÒ</TableHead>
              <TableHead>TRẠNG THÁI</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Chưa có tài khoản nào.
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <StaffRow key={item.id} item={item} onSaved={onSaved} />
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3 text-sm text-muted-foreground">
          {items.length} tài khoản
        </div>
      </CardContent>
    </Card>
  );
}

function StaffRow({ item, onSaved }: { item: StaffListItem; onSaved: () => void }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const status = STATUS_META[item.status];

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(item.fullName)}`}
          >
            {avatarInitials(item.fullName)}
          </span>
          <span className="font-semibold">{item.fullName}</span>
        </div>
      </TableCell>
      <TableCell>{item.phone ?? "—"}</TableCell>
      <TableCell>{item.email ?? "—"}</TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeClasses(item)}`}
        >
          {roleLabel(item)}
        </span>
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}
        >
          {status.label}
        </span>
      </TableCell>
      <TableCell className="text-right">
        {item.role === "staff" && (
          <div className="flex justify-end gap-1.5">
            <StaffFormDialog
              mode="edit"
              staff={item}
              onSaved={onSaved}
              trigger={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Sửa nhân viên"
                  className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
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
                  <Ban className="size-3.5" />
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
        )}
      </TableCell>
    </TableRow>
  );
}
