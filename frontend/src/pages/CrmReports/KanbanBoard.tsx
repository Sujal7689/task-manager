import { Link } from "react-router-dom";
import { STAGE_LABELS, STAGE_ORDER } from "./funnelStages";
import { useLeadReportLink } from "./leadDateFilter";

export interface KanbanLead {
  id: string;
  fullName: string | null;
  company: string | null;
  staffName: string | null;
  lastActivityAt?: string | null;
}

export interface KanbanColumnData {
  stage: string;
  leads: KanbanLead[];
}

const STAGE_ACCENTS: Record<string, string> = {
  PRE_QUALIFIED: "border-t-blue-400",
  QUALIFIED: "border-t-sky-400",
  MEETING_SCHEDULED: "border-t-amber-400",
  MEETING_DONE: "border-t-orange-400",
  CONVERTED: "border-t-green-500",
  DROPPED: "border-t-red-400",
  OTHER: "border-t-slate-300",
};

// Read-only by design — stage comes from Zoho and this report doesn't write
// back to the CRM, so cards aren't draggable between columns.
export default function KanbanBoard({ columns, onSelectLead }: { columns: KanbanColumnData[]; onSelectLead?: (id: string) => void }) {
  const leadLink = useLeadReportLink();
  const ordered = STAGE_ORDER.map((stage) => columns.find((c) => c.stage === stage) ?? { stage, leads: [] });

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {ordered.map((col) => (
        <div
          key={col.stage}
          className={`flex-none w-64 bg-slate-50 border-t-4 ${STAGE_ACCENTS[col.stage] ?? "border-t-slate-300"} border border-slate-200 rounded-xl flex flex-col max-h-[560px]`}
        >
          <div className="px-3 py-2 flex items-center justify-between shrink-0 border-b border-slate-200 bg-white rounded-t-lg">
            <span className="text-sm font-medium text-slate-700">{STAGE_LABELS[col.stage] ?? col.stage}</span>
            <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{col.leads.length}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
            {col.leads.map((l) =>
              onSelectLead ? (
                <button
                  key={l.id}
                  onClick={() => onSelectLead(l.id)}
                  className="w-full text-left bg-white border border-slate-200 rounded-lg p-2 text-sm hover:border-slate-400"
                >
                  <CardBody lead={l} />
                </button>
              ) : (
                <Link key={l.id} to={leadLink(l.id)} className="block bg-white border border-slate-200 rounded-lg p-2 text-sm hover:border-slate-400">
                  <CardBody lead={l} />
                </Link>
              ),
            )}
            {col.leads.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No leads</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CardBody({ lead }: { lead: KanbanLead }) {
  return (
    <>
      <div className="font-medium text-slate-800 truncate">{lead.fullName ?? "(unnamed)"}</div>
      <div className="text-xs text-slate-400 truncate">{lead.company}</div>
      <div className="text-xs text-slate-500 mt-1">{lead.staffName ?? "unassigned"}</div>
    </>
  );
}
