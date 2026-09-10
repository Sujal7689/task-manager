// Section 2.2 of the Leads + Reports spec: Lead_Status has 14 real picklist
// values, not the "5-6 stages" a naive funnel widget might assume. This is
// the single source of truth for grouping them — deliberately a plain code
// map (not hardcoded in the UI layer) so a Zoho admin adding/renaming a
// picklist value later is a one-line change here, not a frontend redeploy.
//
// Recommendation carried over from the spec (not yet confirmed with the
// client — see README "Known gaps"): the primary funnel tracks
// Pre-Qualified -> Qualified -> Meeting Scheduled -> Meeting Done -> Convert,
// with Lost/Junk/Not Qualified as terminal "dropped out" states. Every other
// status is pre-funnel "working" status — real for the lead-wise report, but
// left out of the funnel chart so it doesn't clutter.
export const FUNNEL_STAGE_MAP: Record<string, string> = {
  "Pre-Qualified": "PRE_QUALIFIED",
  Qualified: "QUALIFIED",
  "Meeting Scheduled": "MEETING_SCHEDULED",
  "Meeting Done": "MEETING_DONE",
  Convert: "CONVERTED",
  "Lost Lead": "DROPPED",
  "Junk Lead": "DROPPED",
  "Not Qualified": "DROPPED",
};

// Ordered left-to-right for the funnel chart. DROPPED and OTHER are shown
// separately, not as funnel steps.
export const FUNNEL_ORDER = ["PRE_QUALIFIED", "QUALIFIED", "MEETING_SCHEDULED", "MEETING_DONE", "CONVERTED"] as const;

export function computeFunnelStage(leadStatus: string | null | undefined): string {
  if (!leadStatus) return "OTHER";
  return FUNNEL_STAGE_MAP[leadStatus] ?? "OTHER";
}
