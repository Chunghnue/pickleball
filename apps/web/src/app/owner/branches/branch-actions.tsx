"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Images, Pencil, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BranchFormDialog } from "./branch-form-dialog";
import { BranchImagesDialog } from "./branch-images-dialog";
import { DeleteBranchDialog } from "./delete-branch-dialog";
import type { BranchListItem } from "./types";

const ACTION_BUTTON_CLASS =
  "flex flex-1 flex-col items-center gap-1 rounded-lg border border-input py-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

export function BranchActions({ venue, onSaved }: { venue: BranchListItem; onSaved: () => void }) {
  const [imagesOpen, setImagesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);

  async function handleSetDefault() {
    setSettingDefault(true);
    const response = await fetch(`/api/venues/mine/${venue.id}/set-default`, { method: "POST" });
    setSettingDefault(false);
    if (!response.ok) {
      toast.error("Không thể đặt làm mặc định, vui lòng thử lại.");
      return;
    }
    toast.success("Đã đặt làm chi nhánh mặc định");
    onSaved();
  }

  return (
    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        aria-label="Đặt làm mặc định"
        disabled={settingDefault || venue.isDefault}
        onClick={handleSetDefault}
        className={cn(
          ACTION_BUTTON_CLASS,
          "border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40",
        )}
      >
        <Star className="size-4" />
        Mặc định
      </button>
      <BranchFormDialog
        mode="edit"
        venue={venue}
        onSaved={onSaved}
        trigger={
          <button
            type="button"
            aria-label="Sửa chi nhánh"
            className={cn(
              ACTION_BUTTON_CLASS,
              "border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40",
            )}
          >
            <Pencil className="size-4" />
            Sửa
          </button>
        }
      />
      <button
        type="button"
        aria-label="Quản lý ảnh"
        onClick={() => setImagesOpen(true)}
        className={ACTION_BUTTON_CLASS}
      >
        <Images className="size-4" />
        Ảnh
      </button>
      <button
        type="button"
        aria-label="Xoá chi nhánh"
        onClick={() => setDeleteOpen(true)}
        className={cn(
          ACTION_BUTTON_CLASS,
          "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40",
        )}
      >
        <Trash2 className="size-4" />
        Xoá
      </button>

      <BranchImagesDialog
        open={imagesOpen}
        onOpenChange={setImagesOpen}
        venueId={venue.id}
        images={venue.images}
        onSaved={onSaved}
      />
      <DeleteBranchDialog open={deleteOpen} onOpenChange={setDeleteOpen} venue={venue} onSaved={onSaved} />
    </div>
  );
}
