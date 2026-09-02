import { SetMetadata } from '@nestjs/common';

export const OWNER_SCOPE_KEY = 'ownerScope';
export type OwnerScopeTier = 'full' | 'operational';
export const OwnerScope = (tier: OwnerScopeTier) =>
  SetMetadata(OWNER_SCOPE_KEY, tier);
