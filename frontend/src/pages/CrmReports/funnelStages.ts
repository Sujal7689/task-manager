// Mirrors backend/src/modules/crmLeads/funnelStage.ts's FUNNEL_ORDER +
// DROPPED/OTHER — kept in sync manually since the two currently have no
// shared source (the frontend doesn't import backend code).
export const STAGE_ORDER = ["PRE_QUALIFIED", "QUALIFIED", "MEETING_SCHEDULED", "MEETING_DONE", "CONVERTED", "DROPPED", "OTHER"] as const;

export const STAGE_LABELS: Record<string, string> = {
  PRE_QUALIFIED: "Pre-Qualified",
  QUALIFIED: "Qualified",
  MEETING_SCHEDULED: "Meeting Scheduled",
  MEETING_DONE: "Meeting Done",
  CONVERTED: "Convert",
  DROPPED: "Dropped",
  OTHER: "Other",
};
