import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useLeadDateFilter, useLeadReportLink } from "./leadDateFilter";

interface GroupedLead {
  id: string;
  fullName: string | null;
  company: string | null;
  phone: string | null;
  leadSource: string | null;
  leadStatus: string | null;
  funnelStage: string | null;
  zohoCreatedTime: string | null;
}

interface StaffGroup {
  staffName: string;
  count: number;
  leads: GroupedLead[];
}

export default function GroupedByStaffList() {
  const [groups, setGroups] = useState<StaffGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { createdSince, createdBefore, staffName, country, leadQuality, assignment } = useLeadDateFilter();
  const leadLink = useLeadReportLink();

  useEffect(() => {
    api
      .get<StaffGroup[]>("/crm-lead-reports/dashboard/grouped-by-staff", { params: { createdSince, createdBefore, staffName, country, leadQuality, assignment } })
      .then((res) => setGroups(res.data));
  }, [createdSince, createdBefore, staffName, country, leadQuality, assignment]);

  function toggle(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {groups.map((g) => {
        const isOpen = expanded.has(g.staffName);
        return (
          <div key={g.staffName} className="border-b border-slate-100 last:border-b-0">
            <button
              onClick={() => toggle(g.staffName)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50"
            >
              <span className={`text-slate-400 text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
              <span className="font-medium text-slate-800">{g.staffName}</span>
              <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{g.count}</span>
            </button>
            {isOpen && (
              <div className="max-h-[420px] overflow-y-auto overflow-x-auto border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="px-4 pb-2 pt-2">Lead</th>
                      <th className="px-2 pb-2 pt-2">Created</th>
                      <th className="px-2 pb-2 pt-2">Source</th>
                      <th className="px-2 pb-2 pt-2">Stage</th>
                      <th className="px-2 pb-2 pt-2">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {g.leads.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <Link to={leadLink(l.id)} className="font-medium text-slate-800 hover:underline">
                            {l.fullName ?? "(unnamed)"}
                          </Link>
                          <div className="text-xs text-slate-400">{l.company}</div>
                        </td>
                        <td className="px-2 py-2 text-slate-500 text-xs whitespace-nowrap">
                          {l.zohoCreatedTime ? new Date(l.zohoCreatedTime).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{l.leadSource ?? "—"}</td>
                        <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{l.leadStatus ?? "—"}</td>
                        <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{l.phone ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {groups.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No leads synced yet.</p>}
    </div>
  );
}
