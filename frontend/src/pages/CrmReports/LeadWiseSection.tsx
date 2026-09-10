import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import SearchInput from "../../components/SearchInput";
import { useLeadDateFilter } from "./leadDateFilter";
import KanbanBoard, { KanbanColumnData } from "./KanbanBoard";

interface LeadOption {
  id: string;
  fullName: string | null;
  company: string | null;
  funnelStage: string | null;
  staffName: string | null;
}

interface TimelineEntry {
  id: string;
  kind: "ACTIVITY" | "STAGE_CHANGE" | "OWNER_CHANGE";
  activityType: string | null;
  time: string;
  summary: string | null;
  status: string | null;
  dueDate: string | null;
  actorName: string | null;
  fromValue: string | null;
  toValue: string | null;
}

interface LeadDetail {
  id: string;
  fullName: string | null;
  company: string | null;
  leadSource: string | null;
  leadStatus: string | null;
  funnelStage: string | null;
  staffName: string | null;
  ownerName: string | null;
  zohoCreatedTime: string | null;
  converted: boolean;
  convertedAt: string | null;
  timeline: TimelineEntry[];
}

const ACTIVITY_TYPES = ["NOTE", "CALL", "EVENT", "TASK", "EMAIL"] as const;

const KIND_STYLE: Record<string, { badge: string; accent: string }> = {
  NOTE: { badge: "bg-blue-50 text-blue-700", accent: "border-blue-300" },
  CALL: { badge: "bg-aqua-50 text-emerald-700", accent: "border-emerald-300" },
  TASK: { badge: "bg-orange-50 text-orange-700", accent: "border-orange-300" },
  EVENT: { badge: "bg-amber-50 text-amber-700", accent: "border-amber-300" },
  EMAIL: { badge: "bg-violet-50 text-violet-700", accent: "border-violet-300" },
  STAGE_CHANGE: { badge: "bg-purple-100 text-purple-700", accent: "border-purple-400" },
  OWNER_CHANGE: { badge: "bg-slate-200 text-slate-700", accent: "border-slate-400" },
};

function pill(active: boolean) {
  return `px-3 py-1.5 rounded-lg border ${active ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`;
}

function statusPillClass(status: string | null) {
  if (status === "Completed") return "bg-green-100 text-green-700";
  if (status === "In Progress") return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-700";
}

export default function LeadWiseSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const leadId = searchParams.get("leadId");

  const [view, setView] = useState<"list" | "kanban">("list");
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<LeadOption[]>([]);
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumnData[]>([]);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [activityType, setActivityType] = useState("");
  const { createdSince, createdBefore, staffName } = useLeadDateFilter();

  useEffect(() => {
    if (view !== "list") return;
    api
      .get<LeadOption[]>("/crm-lead-reports/leads", { params: { search: search || undefined, createdSince, createdBefore, staffName } })
      .then((res) => setOptions(res.data));
  }, [view, search, createdSince, createdBefore, staffName]);

  useEffect(() => {
    if (view !== "kanban") return;
    api
      .get<KanbanColumnData[]>("/crm-lead-reports/kanban", { params: { search: search || undefined, createdSince, createdBefore, staffName } })
      .then((res) => setKanbanColumns(res.data));
  }, [view, search, createdSince, createdBefore, staffName]);

  useEffect(() => {
    if (!leadId) {
      setDetail(null);
      return;
    }
    api.get<LeadDetail>(`/crm-lead-reports/leads/${leadId}`, { params: { type: activityType || undefined } }).then((res) => setDetail(res.data));
  }, [leadId, activityType]);

  function selectLead(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("leadId", id);
      return next;
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex gap-1 text-xs">
          <button onClick={() => setView("list")} className={pill(view === "list")}>List</button>
          <button onClick={() => setView("kanban")} className={pill(view === "kanban")}>Kanban</button>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search leads..." className="input w-64" />
      </div>

      {view === "kanban" && (
        <div className="mb-4">
          <KanbanBoard columns={kanbanColumns} onSelectLead={selectLead} />
        </div>
      )}

      <div className={view === "list" ? "grid md:grid-cols-[280px_1fr] gap-4" : ""}>
        {view === "list" && (
          <ul className="border border-slate-200 rounded-xl divide-y divide-slate-50 max-h-[70vh] overflow-y-auto">
            {options.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => selectLead(o.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${leadId === o.id ? "bg-slate-100" : ""}`}
                >
                  <div className="font-medium text-slate-800">{o.fullName ?? "(unnamed)"}</div>
                  <div className="text-xs text-slate-400">
                    {o.company} · {o.staffName ?? "unassigned"}
                  </div>
                </button>
              </li>
            ))}
            {options.length === 0 && <li className="px-3 py-6 text-sm text-slate-400 text-center">No leads found.</li>}
          </ul>
        )}

        <div>
          {!detail ? (
            <p className="text-sm text-slate-400 py-12 text-center">Select a lead to see its detail.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <h2 className="font-medium text-slate-900 text-lg">{detail.fullName ?? "(unnamed)"}</h2>
                <p className="text-sm text-slate-500 mb-3">{detail.company}</p>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-xs text-slate-400">Source</dt><dd>{detail.leadSource ?? "—"}</dd></div>
                  <div><dt className="text-xs text-slate-400">Staff</dt><dd>{detail.staffName ?? "—"}</dd></div>
                  <div><dt className="text-xs text-slate-400">Owner</dt><dd>{detail.ownerName ?? "—"}</dd></div>
                  <div><dt className="text-xs text-slate-400">Stage</dt><dd>{detail.leadStatus ?? "—"}</dd></div>
                  <div><dt className="text-xs text-slate-400">Created</dt><dd>{detail.zohoCreatedTime ? new Date(detail.zohoCreatedTime).toLocaleDateString() : "—"}</dd></div>
                  <div><dt className="text-xs text-slate-400">Converted</dt><dd>{detail.converted ? new Date(detail.convertedAt!).toLocaleDateString() : "No"}</dd></div>
                </dl>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-slate-900">Activity timeline</h3>
                  <select value={activityType} onChange={(e) => setActivityType(e.target.value)} className="input w-auto text-sm">
                    <option value="">All types</option>
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <ol className="space-y-3">
                  {detail.timeline.map((e) => {
                    const kindKey = e.kind === "ACTIVITY" ? (e.activityType ?? "NOTE") : e.kind;
                    const style = KIND_STYLE[kindKey] ?? KIND_STYLE.NOTE;
                    return (
                      <li key={`${e.kind}-${e.id}`} className={`border-l-2 ${style.accent} pl-3`}>
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className={`px-1.5 py-0.5 rounded font-medium ${style.badge}`}>
                            {e.kind === "ACTIVITY" ? e.activityType : e.kind === "STAGE_CHANGE" ? "STAGE" : "OWNER"}
                          </span>
                          {e.status && <span className={`px-1.5 py-0.5 rounded font-medium ${statusPillClass(e.status)}`}>{e.status}</span>}
                          <span className="text-slate-400">{new Date(e.time).toLocaleString()}</span>
                          {e.actorName && <span className="text-slate-400">by {e.actorName}</span>}
                        </div>
                        <div className="text-sm text-slate-700 mt-0.5">
                          {e.kind === "ACTIVITY" ? (
                            <>
                              {e.summary ?? "—"}
                              {e.dueDate && <span className="text-slate-400"> · due {new Date(e.dueDate).toLocaleDateString()}</span>}
                            </>
                          ) : (
                            <>
                              {e.fromValue ?? (e.kind === "STAGE_CHANGE" ? "(new)" : "(unassigned)")} → {e.toValue ?? "(unassigned)"}
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {detail.timeline.length === 0 && <li className="text-sm text-slate-400 text-center py-6">No activity recorded yet.</li>}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
