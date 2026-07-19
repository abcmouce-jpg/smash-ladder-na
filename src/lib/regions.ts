export const NA_REGIONS = ["NA East", "NA Central", "NA South", "NA West", "Other"] as const;

export type NaRegion = (typeof NA_REGIONS)[number];
