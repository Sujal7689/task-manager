import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api/client";
import Pagination from "../../../components/Pagination";
import { useLeadDateFilter, useLeadReportLink } from "../leadDateFilter";

interface Row {
  id: string;
  leadId: string;
  leadName: string;
  type: string;
  actorName: string | null;
  summary: string | null;
  occurredAt: string;
}

const ACTIVITY_TYPES = ["NOTE", "CALL", "EVENT", "TASK", "EMAIL"] as const;
const PAGE_SIZE = 8;

export default function ActivityFeedWidget() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<string>("");
  const { createdSince, createdBefore, staffName } = useLeadDateFilter();
  const leadLink = useLeadReportLink();

  useEffect(() => setPage(1), [createdSince, createdBefore, staffName]);

  useEffect(() => {
    api
      .get("/crm-lead-reports/dashboard/activity-feed", { params: { page, pageSize: PAGE_SIZE, type: type || undefined, createdSince, createdBefore, staffName } })
      .then((res) => {
        setRows(res.data.rows);
        setTotal(res.data.total);
      });
  }, [page, type, createdSince, createdBefore, staffName]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 h-[440px] flex flex-col">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap shrink-0">
        <h2 className="font-medium text-slate-900">Latest activity feed</h2>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="input w-auto text-sm"
        >
          <option value="">All types</option>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-50">
        {rows.map((r) => (
          <li key={r.id} className="py-2 text-sm flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs uppercase text-slate-400 mr-2">{r.type}</span>
              <Link to={leadLink(r.leadId)} className="font-medium text-slate-800 hover:underline">
                {r.leadName}
              </Link>
              <div className="text-slate-500 truncate">{r.summary ?? "—"}</div>
              {r.actorName && <div className="text-xs text-slate-400">by {r.actorName}</div>}
            </div>
            <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(r.occurredAt).toLocaleString()}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-slate-400 text-sm">No activity found.</li>}
      </ul>
      <div className="shrink-0">
        <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
}
