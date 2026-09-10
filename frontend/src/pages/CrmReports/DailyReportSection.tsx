import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../../api/client";
import { CATEGORICAL } from "../../lib/chartColors";
import { useLeadDateFilter, useLeadReportLink } from "./leadDateFilter";

interface DailyItem {
  activityId: string;
  leadId: string;
  leadName: string;
  company: string | null;
  staff: string | null;
  subject: string | null;
  status: string | null;
  time: string;
}

interface DailySection {
  total: number;
  byStaff: { staff: string; count: number }[];
  items: DailyItem[];
}

interface CallsYesterdaySection extends DailySection {
  missed: number;
}

interface DailyReport {
  date: string;
  completedYesterday: DailySection;
  dueToday: DailySection;
  callsYesterday: CallsYesterdaySection;
  callsToday: DailySection;
}

const PIE_COLORS = [CATEGORICAL.blue, CATEGORICAL.aqua, CATEGORICAL.orange, CATEGORICAL.yellow, CATEGORICAL.magenta, CATEGORICAL.green, CATEGORICAL.violet, CATEGORICAL.red];

// Client-confirmed scope: CRM Leads/Calls only, meant to be pulled up as one
// continuous sheet during the morning meeting — so unlike the Dashboard
// widgets, tables here deliberately don't cap height/scroll internally.
export default function DailyReportSection() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const leadLink = useLeadReportLink();
  const { staffName } = useLeadDateFilter();

  useEffect(() => {
    api.get<DailyReport>("/crm-lead-reports/daily", { params: { staffName } }).then((res) => setReport(res.data));
  }, [staffName]);

  if (!report) return <p className="text-sm text-slate-400 py-12 text-center">Loading...</p>;

  const dateLabel = new Date(report.date).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Daily Report</h2>
        <p className="text-sm text-slate-500">{dateLabel} (Nepal time) — for the morning meeting</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PieCard title={`Completed yesterday (${report.completedYesterday.total})`} data={report.completedYesterday.byStaff} />
        <PieCard title={`Calls yesterday (${report.callsYesterday.total})`} data={report.callsYesterday.byStaff} />
        <PieCard title={`Due today (${report.dueToday.total})`} data={report.dueToday.byStaff} />
        <PieCard title={`Calls today (${report.callsToday.total})`} data={report.callsToday.byStaff} />
      </div>

      <ReportTable
        title="Tasks completed yesterday"
        items={report.completedYesterday.items}
        leadLink={leadLink}
        emptyLabel="No tasks were marked completed yesterday."
      />
      <ReportTable
        title="Calls that were supposed to happen yesterday"
        subtitle={report.callsYesterday.missed > 0 ? `${report.callsYesterday.missed} still show as not completed` : undefined}
        items={report.callsYesterday.items}
        leadLink={leadLink}
        emptyLabel="No calls were scheduled for yesterday."
        flagMissed
      />
      <ReportTable title="Tasks due today" items={report.dueToday.items} leadLink={leadLink} emptyLabel="No open tasks are due today." />
      <ReportTable title="Calls today — who's assigned" items={report.callsToday.items} leadLink={leadLink} emptyLabel="No calls scheduled for today." />
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
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-medium text-slate-900">
          {title} <span className="text-sm font-normal text-slate-400">({items.length})</span>
        </h3>
        {subtitle && <p className="text-xs text-amber-600">{subtitle}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="px-4 pb-2">Lead</th>
              <th className="px-2 pb-2">Staff</th>
              <th className="px-2 pb-2">Subject</th>
              <th className="px-2 pb-2">Status</th>
              <th className="px-4 pb-2">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((it) => {
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
                  <td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap">{new Date(it.time).toLocaleString()}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
