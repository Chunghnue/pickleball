"use client";

import { useEffect, useState } from "react";
import { Search, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { CustomerListItem } from "../customers/types";

export interface CustomerSelection {
  label: string;
  payload: { customerId: string } | { customerContactId: string };
}

export function CustomerSelector({
  value,
  onChange,
}: {
  value: CustomerSelection | null;
  onChange: (value: CustomerSelection | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerListItem[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/customers?search=${encodeURIComponent(trimmed)}&page=1&pageSize=5`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setResults(data?.items ?? []));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-2">
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{value.label}</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Bỏ chọn khách hàng"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm khách có sẵn theo tên hoặc SĐT..."
          className="h-9 border-0 px-0 focus-visible:ring-0"
        />
      </div>
      {results.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-lg border">
          {results.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    label: `${item.fullName} · ${item.phone ?? ""}`,
                    payload:
                      item.kind === "registered"
                        ? { customerId: item.id }
                        : { customerContactId: item.id },
                  })
                }
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>{item.fullName}</span>
                <span className="text-muted-foreground">{item.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
