import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api/client";
import Pagination from "../../../components/Pagination";
import SearchInput from "../../../components/SearchInput";
import { useLeadDateFilter, useLeadReportLink } from "../leadDateFilter";

interface Row {
  id: string;
  fullName: string | null;
  company: string | null;
  funnelStage: string | null;
  staffName: string | null;
  assignedAt: string | null;
  lastActivity: { type: string; summary: string | null; occurredAt: string } | null;
  lastActivityAt: string | null;
}

const PAGE_SIZE = 10;

export default function AssignmentOverviewWidget() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { createdSince, createdBefore, staffName, country, leadQuality, assignment } = useLeadDateFilter();
  const leadLink = useLeadReportLink();

  useEffect(() => setPage(1), [createdSince, createdBefore, staffName, country, leadQuality, assignment]);

  useEffect(() => {
    api
      .get("/crm-lead-reports/dashboard/assignment-overview", {
        params: { page, pageSize: PAGE_SIZE, search: search || undefined, createdSince, createdBefore, staffName, country, leadQuality, assignment },
      })
      .then((res) => {
        setRows(res.data.rows);
        setTotal(res.data.total);
      });
  }, [page, search, createdSince, createdBefore, staffName, country, leadQuality, assignment]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 h-[440px] flex flex-col">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap shrink-0">
        <h2 className="font-medium text-slate-900">Assignment overview</h2>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search lead, company, owner..."
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="pb-2 pr-3">Lead</th>
              <th className="pb-2 pr-3">Staff</th>
              <th className="pb-2 pr-3">Assigned</th>
              <th className="pb-2">Latest activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pr-3">
                  <Link to={leadLink(r.id)} className="font-medium text-slate-800 hover:underline">
                    {r.fullName ?? "(unnamed)"}
                  </Link>
                  <div className="text-xs text-slate-400">{r.company}</div>
                </td>
                <td className="py-2 pr-3 text-slate-600">{r.staffName ?? "—"}</td>
                <td className="py-2 pr-3 text-slate-500 text-xs">{r.assignedAt ? new Date(r.assignedAt).toLocaleDateString() : "—"}</td>
                <td className="py-2 text-slate-600">
                  {r.lastActivity ? (
                    <>
                      <span className="text-xs uppercase text-slate-400 mr-1">{r.lastActivity.type}</span>
                      {r.lastActivity.summary ?? ""}
                      <span className="text-xs text-slate-400 ml-1">({new Date(r.lastActivity.occurredAt).toLocaleDateString()})</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400">
                  No leads found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="shrink-0">
        <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
}
