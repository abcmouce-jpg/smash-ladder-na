export const NA_REGIONS = ["NA East", "NA Central", "NA South", "NA West", "Canada", "Other"] as const;

export type NaRegion = (typeof NA_REGIONS)[number];
