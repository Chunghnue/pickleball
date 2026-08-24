import { ValueTransformer } from 'typeorm';

// Postgres TIME columns round-trip as 'HH:MM:SS' text (no seconds-stripping
// like DATE columns get), while every in-memory/generated value in this
// module is 'HH:MM'. Normalize on read so comparisons and date-string
// arithmetic stay consistent.
export const timeColumnTransformer: ValueTransformer = {
  to: (value: string) => value,
  from: (value: string) => value.slice(0, 5),
};
