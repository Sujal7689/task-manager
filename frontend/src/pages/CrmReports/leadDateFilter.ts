import { useSearchParams } from "react-router-dom";

// Shared across every CRM Reports tab via the URL (?cutoffOn=&cutoffDate=
// &cutoffDateTo=&staffFilter=) so it survives tab switches and is
// shareable/bookmarkable, the same way `report`/`leadId` already are.
// `staffFilter` holds the lead's "Staff Name" custom field value, not the
// Zoho Owner — see crmLeadReports.service.ts for why that distinction matters.
export const DEFAULT_CUTOFF_DATE = "2026-08-01";
const FILTER_PARAM_KEYS = ["cutoffOn", "cutoffDate", "cutoffDateTo", "staffFilter"] as const;

export function useLeadDateFilter() {
  const [searchParams] = useSearchParams();
  const on = searchParams.get("cutoffOn") !== "0"; // on by default until explicitly turned off
  const date = searchParams.get("cutoffDate") || DEFAULT_CUTOFF_DATE;
  const dateTo = searchParams.get("cutoffDateTo") || "";
  const staffFilter = searchParams.get("staffFilter") || "";
  return {
    on,
    date,
    dateTo,
    staffFilter,
    createdSince: on ? date : undefined,
    createdBefore: on && dateTo ? dateTo : undefined,
    staffName: staffFilter || undefined,
  };
}

// Every place a lead is shown (Dashboard widgets, Staff-wise) should link
// through to its Lead-wise report — carrying the current filters along so
// navigating there doesn't silently reset them back to the default.
export function useLeadReportLink() {
  const [searchParams] = useSearchParams();
  return (leadId: string) => {
    const params = new URLSearchParams();
    params.set("report", "lead-wise");
    params.set("leadId", leadId);
    for (const key of FILTER_PARAM_KEYS) {
      const v = searchParams.get(key);
      if (v !== null) params.set(key, v);
    }
    return `/crm-reports?${params.toString()}`;
  };
}
