"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "selected-branch-id";
export const ALL_BRANCHES_ID = "all";

interface BranchContextValue {
  selectedVenueId: string;
  setSelectedVenueId: (venueId: string) => void;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [selectedVenueId, setSelectedVenueIdState] = useState(ALL_BRANCHES_ID);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSelectedVenueIdState(stored);
    }
  }, []);

  function setSelectedVenueId(venueId: string) {
    setSelectedVenueIdState(venueId);
    localStorage.setItem(STORAGE_KEY, venueId);
  }

  return (
    <BranchContext.Provider value={{ selectedVenueId, setSelectedVenueId }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchContextValue {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error("useBranch must be used within a BranchProvider");
  }
  return context;
}
