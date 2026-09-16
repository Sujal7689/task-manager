import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

// Percent-complete is audited more aggressively than anything else: the
// Task progress slider (TaskDetail.tsx) fires a PATCH per drag tick, and
// the audit middleware (config/prisma.ts) writes one AuditLog row per
// update call — so a single drag from 20% to 65% can leave a dozen rows
// behind. Nobody reading the log wants each individual nudge; they want to
// know "this task's completion moved today." This collapses every
// percentComplete row for the same Task on the same calendar day into one
// summary row (the day's earliest oldValue -> its latest newValue), tagged
// with how many individual updates it stands in for. Every other field
// keeps its existing one-row-per-change behavior untouched.
const ROW_SAFETY_CAP = 5000; // fine at this org's current audit volume, revisit if it grows much further

export interface AuditLogRow {
  id: string;
  entityType: string;
  entityId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
  changedBy: { name: string };
  // Only set on a collapsed percentComplete row that stands in for more
  // than one raw update — lets the UI say "(adjusted N times)" instead of
  // silently hiding that multiple changes happened.
  mergedCount?: number;
}

function collapsePercentComplete(rows: AuditLogRow[]): AuditLogRow[] {
  const collapsed: AuditLogRow[] = [];
  const groups = new Map<string, AuditLogRow[]>();
  for (const row of rows) {
    if (row.entityType !== "Task" || row.fieldChanged !== "percentComplete") {
      collapsed.push(row);
      continue;
    }
    const day = row.changedAt.toISOString().slice(0, 10);
    const key = `${row.entityId}|${day}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  for (const group of groups.values()) {
    // Rows arrive sorted changedAt desc, so within a group the first entry
    // is that day's most recent change and the last is its earliest.
    const newest = group[0];
    const oldest = group[group.length - 1];
    collapsed.push({
      ...newest,
      oldValue: oldest.oldValue,
      newValue: newest.newValue,
      mergedCount: group.length > 1 ? group.length : undefined,
    });
  }
  return collapsed.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
}

export async function listAuditLog(
  filters: { entityType?: string; entityId?: string; search?: string },
  options?: { skip: number; take: number },
) {
  const where: Prisma.AuditLogWhereInput = {
    entityType: filters.entityType,
    entityId: filters.entityId,
    ...(filters.search
      ? { OR: [{ entityType: { contains: filters.search, mode: "insensitive" } }, { changedBy: { name: { contains: filters.search, mode: "insensitive" } } }] }
      : {}),
  };
  const include = { changedBy: { select: { name: true } } };
  const orderBy = { changedAt: "desc" as const };

  // Collapsing changes the row count (many percentComplete rows become
  // one), so pagination has to happen after grouping, over the full
  // matching set — a DB-side count/skip/take would paginate the wrong
  // (pre-collapse) total instead of what's actually being displayed.
  const rows = await prisma.auditLog.findMany({ where, include, orderBy, take: ROW_SAFETY_CAP });
  const collapsed = collapsePercentComplete(rows);

  if (!options) {
    return collapsed.slice(0, 500);
  }
  const total = collapsed.length;
  const items = collapsed.slice(options.skip, options.skip + options.take);
  return { items, total };
}
