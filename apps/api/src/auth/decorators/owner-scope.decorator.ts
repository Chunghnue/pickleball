import { SetMetadata } from '@nestjs/common';

export const OWNER_SCOPE_KEY = 'ownerScope';
// 'owner' > 'full' > 'operational'. Most owner-facing modules use 'full'
// (owner + manager); 'owner' is for endpoints only the actual account owner
// should reach even though a manager otherwise has full-tier access
// elsewhere — currently just Staff Accounts (managing other staff is a
// sensitive capability not delegated to managers by default).
export type OwnerScopeTier = 'full' | 'operational' | 'owner';
export const OwnerScope = (tier: OwnerScopeTier) =>
  SetMetadata(OWNER_SCOPE_KEY, tier);
