import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../../api/client";
import { CATEGORICAL } from "../../lib/chartColors";
import Pagination from "../../components/Pagination";
import { useLeadDateFilter, useLeadReportLink } from "./leadDateFilter";

interface DailyItem {
  activityId: string;
  leadId: string;
  leadName: string;
  company: string | null;
  staff: string | null;
  subject: string | null;
  status: string | null;
  scheduledAt: string | null;
  time: string;
  latestNote: string | null;
}

interface DailySection {
  total: number;
  byStaff: { staff: string; count: number }[];
  items: DailyItem[];
}

interface CallsYesterdaySection extends DailySection {
  missed: number;
}

interface LeadsAssignedRow {
  staff: string;
  count: number;
}

interface DailyReport {
  fromDate: string;
  toDate: string;
  leadsAssigned: LeadsAssignedRow[];
  completedYesterday: DailySection;
  dueToday: DailySection;
  callsYesterday: CallsYesterdaySection;
  callsToday: DailySection;
}

const PIE_COLORS = [CATEGORICAL.blue, CATEGORICAL.aqua, CATEGORICAL.orange, CATEGORICAL.yellow, CATEGORICAL.magenta, CATEGORICAL.green, CATEGORICAL.violet, CATEGORICAL.red];

// Nepal-local (UTC+5:45) plain YYYY-MM-DD — the From/To defaults, matching
// the backend's own day-boundary semantics.
function nepalDateStr(daysAgo: number): string {
  const d = new Date(Date.now() + (5 * 60 + 45) * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function formatShort(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Client-confirmed scope: CRM Leads/Calls only. The four tables sit in a
// 2-up grid, each a fixed-height card with its own internal scroll +
// pagination (same convention as the Dashboard widgets) — the point is
// everything fits on one screen at a glance for the morning meeting, paging
// through a section's rows rather than scrolling far down the whole page.
// From/To are independently-chosen days (a genuine range, not forced to be
// adjacent): "completed"/"calls that happened" reads from `from`, "due"/
// "calls scheduled" reads from `to` — same roles yesterday/today played
// before, just user-selectable, so a past morning meeting can be reviewed.
export default function DailyReportSection() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [fromDate, setFromDate] = useState(nepalDateStr(1));
  const [toDate, setToDate] = useState(nepalDateStr(0));
  const leadLink = useLeadReportLink();
  const { staffName } = useLeadDateFilter();

  useEffect(() => {
    api.get<DailyReport>("/crm-lead-reports/daily", { params: { staffName, from: fromDate, to: toDate } }).then((res) => setReport(res.data));
  }, [staffName, fromDate, toDate]);

  if (!report) return <p className="text-sm text-slate-400 py-12 text-center">Loading...</p>;

  const isDefaultRange = fromDate === nepalDateStr(1) && toDate === nepalDateStr(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Daily Report</h2>
          <p className="text-sm text-slate-500">for the morning meeting (Nepal time)</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input w-auto py-1 text-sm" />
          <label className="text-xs text-slate-500">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input w-auto py-1 text-sm" />
          {!isDefaultRange && (
            <button
              onClick={() => {
                setFromDate(nepalDateStr(1));
                setToDate(nepalDateStr(0));
              }}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              Back to yesterday/today
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <OverviewStat
          label="Leads assigned"
          value={report.leadsAssigned.reduce((s, r) => s + r.count, 0)}
        />
        <OverviewStat
          label="Tasks (completed + due)"
          value={report.completedYesterday.total + report.dueToday.total}
        />
        <OverviewStat
          label="Calls (both days)"
          value={report.callsYesterday.total + report.callsToday.total}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-medium text-slate-700 mb-3">Leads assigned per staff</h3>
        {report.leadsAssigned.length === 0 ? (
          <p className="text-xs text-slate-400">No leads have a Staff Name assigned yet.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {report.leadsAssigned.map((r) => (
              <div key={r.staff} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 min-w-[120px]">
                <p className="text-xs text-slate-500">{r.staff}</p>
                <p className="text-lg font-semibold text-slate-900">{r.count}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PieCard title={`Completed ${formatShort(report.fromDate)} (${report.completedYesterday.total})`} data={report.completedYesterday.byStaff} />
        <PieCard title={`Calls ${formatShort(report.fromDate)} (${report.callsYesterday.total})`} data={report.callsYesterday.byStaff} />
        <PieCard title={`Due ${formatShort(report.toDate)} (${report.dueToday.total})`} data={report.dueToday.byStaff} />
        <PieCard title={`Calls ${formatShort(report.toDate)} (${report.callsToday.total})`} data={report.callsToday.byStaff} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ReportTable
          title={`Tasks completed (${formatDay(report.fromDate)})`}
          items={report.completedYesterday.items}
          leadLink={leadLink}
          emptyLabel="No tasks were marked completed."
        />
        <ReportTable
          title={`Calls that were supposed to happen (${formatDay(report.fromDate)})`}
          subtitle={report.callsYesterday.missed > 0 ? `${report.callsYesterday.missed} still show as not completed` : undefined}
          items={report.callsYesterday.items}
          leadLink={leadLink}
          emptyLabel="No calls were scheduled."
          flagMissed
        />
        <ReportTable
          title={`Tasks due (${formatDay(report.toDate)})`}
          items={report.dueToday.items}
          leadLink={leadLink}
          emptyLabel="No open tasks are due."
        />
        <ReportTable
          title={`Calls — who's assigned (${formatDay(report.toDate)})`}
          items={report.callsToday.items}
          leadLink={leadLink}
          emptyLabel="No calls scheduled."
        />
      </div>
    </div>
  );
}

function OverviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
    </div>
  );
}

function PieCard({ title, data }: { title: string; data: { staff: string; count: number }[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-slate-700 mb-2">{title}</h3>
      {data.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-16">No data.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="staff"
              innerRadius={40}
              outerRadius={75}
              paddingAngle={2}
              label={(p: { staff?: string; percent?: number }) => `${p.staff ?? ""} ${((p.percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
              style={{ fontSize: 10 }}
            >
              {data.map((d, i) => (
                <Cell key={d.staff} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#fff" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

const ROWS_PER_PAGE = 8;

// Fixed-height card with its own internal scroll + pagination — one screen
// should show every section's header/first rows at once (2-up grid above),
// with "scroll through pages" via Prev/Next instead of one long page you
// have to scroll far down to get past.
function ReportTable({
  title,
  subtitle,
  items,
  leadLink,
  emptyLabel,
  flagMissed = false,
}: {
  title: string;
  subtitle?: string;
  items: DailyItem[];
  leadLink: (id: string) => string;
  emptyLabel: string;
  flagMissed?: boolean;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE));
  const pageItems = items.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden h-[420px] flex flex-col">
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h3 className="font-medium text-slate-900">
          {title} <span className="text-sm font-normal text-slate-400">({items.length})</span>
        </h3>
        {subtitle && <p className="text-xs text-amber-600">{subtitle}</p>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="px-4 pb-2">Lead</th>
              <th className="px-2 pb-2">Staff</th>
              <th className="px-2 pb-2">Subject</th>
              <th className="px-2 pb-2">Status</th>
              <th className="px-2 pb-2">Scheduled</th>
              <th className="px-2 pb-2">Actual/Updated</th>
              <th className="px-4 pb-2">Latest note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pageItems.map((it) => {
              const missed = flagMissed && it.status !== "Completed";
              return (
                <tr key={it.activityId} className={missed ? "bg-amber-50" : undefined}>
                  <td className="px-4 py-2">
                    <Link to={leadLink(it.leadId)} className="font-medium text-slate-800 hover:underline">
                      {it.leadName}
                    </Link>
                    <div className="text-xs text-slate-400">{it.company}</div>
                  </td>
                  <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{it.staff ?? "Unassigned"}</td>
                  <td className="px-2 py-2 text-slate-600">{it.subject ?? "—"}</td>
                  <td className={`px-2 py-2 whitespace-nowrap ${missed ? "text-amber-700 font-medium" : "text-slate-600"}`}>
                    {it.status ?? "—"}
                    {missed && " (missed)"}
                  </td>
                  <td className="px-2 py-2 text-slate-500 text-xs whitespace-nowrap">
                    {it.scheduledAt ? new Date(it.scheduledAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-2 py-2 text-slate-500 text-xs whitespace-nowrap">{new Date(it.time).toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-600 text-xs max-w-[220px]">{it.latestNote ?? "—"}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="shrink-0">
        <Pagination page={page} totalPages={totalPages} total={items.length} pageSize={ROWS_PER_PAGE} onPageChange={setPage} />
      </div>
    </div>
  );
}
