"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Images, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BranchFormDialog } from "./branch-form-dialog";
import { BranchImagesDialog } from "./branch-images-dialog";
import { DeleteBranchDialog } from "./delete-branch-dialog";
import type { BranchListItem } from "./types";

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
    <div className="flex flex-wrap items-center gap-1.5">
      {!venue.isDefault && (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Đặt làm mặc định"
          disabled={settingDefault}
          onClick={handleSetDefault}
          className="border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
        >
          <Star className="size-3.5" />
        </Button>
      )}
      <BranchFormDialog
        mode="edit"
        venue={venue}
        onSaved={onSaved}
        trigger={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Sửa chi nhánh"
            className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
          >
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Quản lý ảnh"
        onClick={() => setImagesOpen(true)}
        className="border-input text-muted-foreground hover:bg-muted"
      >
        <Images className="size-3.5" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Xoá chi nhánh"
        onClick={() => setDeleteOpen(true)}
        className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        <Trash2 className="size-3.5" />
      </Button>

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
