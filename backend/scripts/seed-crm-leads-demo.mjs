// Local-only helper: populates ~40 fake Zoho leads (with owners, stage/owner
// history, and activities) so the CRM Reports UI (Admin/Manager/Team Lead ->
// CRM Reports) has something to show without real Zoho credentials. Not part
// of the shipped app — mirrors dev-db.mjs's "dev/test convenience" role.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OWNERS = [
  { id: "zu1", name: "Harsh Singhania" },
  { id: "zu2", name: "Priya Shah" },
  { id: "zu3", name: "Rohan Gupta" },
];

const STAGES = ["Pre-Qualified", "Qualified", "Meeting Scheduled", "Meeting Done", "Convert", "Lost Lead", "Contacted", "Inquiry"];
const FUNNEL = {
  "Pre-Qualified": "PRE_QUALIFIED",
  Qualified: "QUALIFIED",
  "Meeting Scheduled": "MEETING_SCHEDULED",
  "Meeting Done": "MEETING_DONE",
  Convert: "CONVERTED",
  "Lost Lead": "DROPPED",
  Contacted: "OTHER",
  Inquiry: "OTHER",
};

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main() {
  for (let i = 0; i < 40; i++) {
    const owner = OWNERS[i % OWNERS.length];
    const stage = STAGES[i % STAGES.length];
    const createdDaysAgo = 5 + (i % 60);
    const converted = stage === "Convert";
    const lead = await prisma.crmLead.upsert({
      where: { zohoId: `DEMO-${i}` },
      update: {},
      create: {
        zohoId: `DEMO-${i}`,
        fullName: `Demo Lead ${i}`,
        company: `Demo Co ${i % 12}`,
        email: `lead${i}@example.com`,
        leadSource: ["Website", "Referral", "Cold Call", "Advertisement"][i % 4],
        leadStatus: stage,
        funnelStage: FUNNEL[stage],
        ownerId: owner.id,
        ownerName: owner.name,
        ownerEmail: `${owner.name.split(" ")[0].toLowerCase()}@example.com`,
        converted,
        convertedAt: converted ? daysAgo(createdDaysAgo - 3) : null,
        zohoCreatedTime: daysAgo(createdDaysAgo),
        zohoModifiedTime: daysAgo(Math.max(0, createdDaysAgo - 2)),
        lastActivityAt: daysAgo(Math.max(0, createdDaysAgo - 1)),
        rawData: { Lead_Status: stage, demo: true },
      },
    });

    // Fixed, deterministic ids (rather than letting Prisma cuid() them) so
    // re-running this script against the same DB is a no-op via upsert
    // instead of piling up duplicate history rows every run.
    await prisma.crmLeadOwnerHistory.upsert({
      where: { id: `${lead.id}-init` },
      update: {},
      create: { id: `${lead.id}-init`, leadId: lead.id, fromOwnerId: null, fromOwnerName: null, toOwnerId: owner.id, toOwnerName: owner.name, changedAt: daysAgo(createdDaysAgo) },
    });

    await prisma.crmLeadStageHistory.upsert({
      where: { id: `${lead.id}-stage-init` },
      update: {},
      create: { id: `${lead.id}-stage-init`, leadId: lead.id, fromStage: null, toStage: stage, changedAt: daysAgo(createdDaysAgo - 1) },
    });

    // A recent stage move for a few leads so "movement in the last 24h" has data.
    if (i % 9 === 0) {
      await prisma.crmLeadStageHistory.upsert({
        where: { id: `${lead.id}-stage-recent` },
        update: {},
        create: { id: `${lead.id}-stage-recent`, leadId: lead.id, fromStage: "Contacted", toStage: stage, changedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
      });
    }

    const activityTypes = ["NOTE", "CALL", "EVENT", "TASK", "EMAIL"];
    for (let a = 0; a < 3; a++) {
      const type = activityTypes[(i + a) % activityTypes.length];
      await prisma.crmLeadActivity.upsert({
        where: { leadId_activityType_zohoActivityId: { leadId: lead.id, activityType: type, zohoActivityId: `DEMO-${i}-A${a}` } },
        update: {},
        create: {
          leadId: lead.id,
          activityType: type,
          zohoActivityId: `DEMO-${i}-A${a}`,
          occurredAt: daysAgo(Math.max(0, createdDaysAgo - 1 - a)),
          actorId: owner.id,
          actorName: owner.name,
          summary: `${type} activity #${a} for lead ${i}`,
          rawData: { demo: true },
        },
      });
    }
  }

  await prisma.crmSyncState.upsert({
    where: { module: "Leads" },
    update: { lastSyncedModifiedTime: new Date(), lastFullSyncAt: new Date(), status: "OK" },
    create: { module: "Leads", lastSyncedModifiedTime: new Date(), lastFullSyncAt: new Date(), status: "OK" },
  });

  console.log("Seeded demo CRM leads.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
