export type StaffRole = "manager" | "cashier" | "staff";
export type AccountRole = "owner" | StaffRole;
export type AccountStatus =
  | "pending_verification"
  | "pending_approval"
  | "active"
  | "rejected"
  | "suspended";

export interface StaffListItem {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: "owner" | "staff";
  staffRole: StaffRole | null;
  status: AccountStatus;
}

export type RoleTab = "all" | "owner" | StaffRole;
