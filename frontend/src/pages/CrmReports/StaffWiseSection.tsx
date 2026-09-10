import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useLeadDateFilter, useLeadReportLink } from "./leadDateFilter";
import KanbanBoard, { KanbanColumnData } from "./KanbanBoard";

interface StaffOverviewRow {
  staffName: string;
  leadsOwned: number;
  conversionRate: number;
  activitiesLogged: number;
  lastActivityAt: string | null;
}

interface StaffDetail {
  staffName: string;
  leads: {
    id: string;
    fullName: string | null;
    company: string | null;
    funnelStage: string | null;
    converted: boolean;
    assignedAt: string | null;
    lastActivity: { type: string; summary: string | null; occurredAt: string } | null;
  }[];
  stats: { leadsOwned: number; activitiesLogged: number; conversionRate: number };
}

function pill(active: boolean) {
  return `px-2 py-1 rounded-lg border text-xs ${active ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`;
}

export default function StaffWiseSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Distinct from the global "staffFilter" query param (the shared filter
  // bar's staff dropdown, which narrows aggregates everywhere) — this is
  // "which person's drill-down page am I on" within this tab specifically.
  const selectedStaff = searchParams.get("staffName");

  const [overview, setOverview] = useState<StaffOverviewRow[]>([]);
  const [detail, setDetail] = useState<StaffDetail | null>(null);
  const [leadsView, setLeadsView] = useState<"table" | "kanban">("table");
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumnData[]>([]);
  const { createdSince, createdBefore, staffName: globalStaffFilter } = useLeadDateFilter();
  const leadLink = useLeadReportLink();

  useEffect(() => {
    api.get<StaffOverviewRow[]>("/crm-lead-reports/staff", { params: { createdSince, createdBefore, staffName: globalStaffFilter } }).then((res) => setOverview(res.data));
  }, [createdSince, createdBefore, globalStaffFilter]);

  useEffect(() => {
    if (!selectedStaff) {
      setDetail(null);
      return;
    }
    api
      .get<StaffDetail>(`/crm-lead-reports/staff/${encodeURIComponent(selectedStaff)}`, { params: { createdSince, createdBefore } })
      .then((res) => setDetail(res.data));
  }, [selectedStaff, createdSince, createdBefore]);

  useEffect(() => {
    if (!selectedStaff || leadsView !== "kanban") return;
    api
      .get<KanbanColumnData[]>("/crm-lead-reports/kanban", { params: { staffName: selectedStaff, createdSince, createdBefore } })
      .then((res) => setKanbanColumns(res.data));
  }, [selectedStaff, leadsView, createdSince, createdBefore]);

  function selectStaff(name: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("staffName", name);
      return next;
    });
  }

  function backToOverview() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("staffName");
      return next;
    });
  }

  // No one picked yet: the default view is "what's everyone up to", not a
  // forced single-person drill-down — selecting a row is optional.
  if (!selectedStaff || !detail) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <h2 className="font-medium text-slate-900">Staff overview</h2>
          <p className="text-xs text-slate-400">Click a row to see that person's leads and activity in detail.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="px-4 pb-2">Staff</th>
                <th className="px-4 pb-2">Leads owned</th>
                <th className="px-4 pb-2">Conversion rate</th>
                <th className="px-4 pb-2">Activities logged</th>
                <th className="px-4 pb-2">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {overview.map((o) => (
                <tr key={o.staffName} onClick={() => selectStaff(o.staffName)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{o.staffName}</td>
                  <td className="px-4 py-2.5 text-slate-600">{o.leadsOwned}</td>
                  <td className="px-4 py-2.5 text-slate-600">{o.conversionRate}%</td>
                  <td className="px-4 py-2.5 text-slate-600">{o.activitiesLogged}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{o.lastActivityAt ? new Date(o.lastActivityAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {overview.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No leads synced yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={backToOverview} className="text-sm text-slate-500 hover:text-slate-800 w-fit">
        ← All staff
      </button>

      <div className="flex flex-col gap-4 h-[75vh] min-h-[520px]">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shrink-0">
          <h2 className="font-medium text-slate-900 text-lg mb-3">{detail.staffName}</h2>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-slate-400">Leads owned</dt><dd className="text-lg font-medium">{detail.stats.leadsOwned}</dd></div>
            <div><dt className="text-xs text-slate-400">Activities logged</dt><dd className="text-lg font-medium">{detail.stats.activitiesLogged}</dd></div>
            <div><dt className="text-xs text-slate-400">Conversion rate</dt><dd className="text-lg font-medium">{detail.stats.conversionRate}%</dd></div>
          </dl>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h3 className="font-medium text-slate-900">Leads assigned</h3>
            <div className="flex gap-1">
              <button onClick={() => setLeadsView("table")} className={pill(leadsView === "table")}>Table</button>
              <button onClick={() => setLeadsView("kanban")} className={pill(leadsView === "kanban")}>Kanban</button>
            </div>
          </div>
          {leadsView === "table" ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-2 pr-3">Lead</th>
                    <th className="pb-2 pr-3">Stage</th>
                    <th className="pb-2 pr-3">Assigned</th>
                    <th className="pb-2">Latest activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {detail.leads.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 pr-3">
                        <Link to={leadLink(l.id)} className="font-medium text-slate-800 hover:underline">
                          {l.fullName ?? "(unnamed)"}
                        </Link>
                        <div className="text-xs text-slate-400">{l.company}</div>
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{l.funnelStage}{l.converted ? " · converted" : ""}</td>
                      <td className="py-2 pr-3 text-slate-500 text-xs">{l.assignedAt ? new Date(l.assignedAt).toLocaleDateString() : "—"}</td>
                      <td className="py-2 text-slate-600">
                        {l.lastActivity ? (
                          <>
                            <span className="text-xs uppercase text-slate-400 mr-1">{l.lastActivity.type}</span>
                            {l.lastActivity.summary ?? ""}
                            <span className="text-xs text-slate-400 ml-1">({new Date(l.lastActivity.occurredAt).toLocaleDateString()})</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                  {detail.leads.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400">No leads currently assigned.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <KanbanBoard columns={kanbanColumns} />
          )}
        </div>
      </div>
    </div>
  );
}
