import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORICAL, CHART_CHROME } from "../../../lib/chartColors";

interface MemberChartRow {
  name: string;
  totalClosed: number;
  onTimePct: number;
  estimatedHours: number;
  actualHours: number;
}

function shortName(n: string) {
  return n.length > 10 ? `${n.slice(0, 9)}…` : n;
}

export default function TeamPerformanceCharts({ members }: { members: MemberChartRow[] }) {
  return (
    <div className="grid lg:grid-cols-3 gap-4 mb-8">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-medium text-slate-900 mb-3">Tasks completed</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={members} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
            <XAxis dataKey="name" tickFormatter={shortName} tick={{ fontSize: 11, fill: CHART_CHROME.axis }} axisLine={{ stroke: CHART_CHROME.gridline }} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 12, fill: CHART_CHROME.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="totalClosed" name="Completed" fill={CATEGORICAL.aqua} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-medium text-slate-900 mb-3">On-time completion %</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={members} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
            <XAxis dataKey="name" tickFormatter={shortName} tick={{ fontSize: 11, fill: CHART_CHROME.axis }} axisLine={{ stroke: CHART_CHROME.gridline }} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 12, fill: CHART_CHROME.axis }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={((v: unknown) => `${v}%`) as never} />
            <Bar dataKey="onTimePct" name="On-Time %" fill={CATEGORICAL.blue} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-medium text-slate-900 mb-3">Estimated vs actual hours</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={members} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
            <XAxis dataKey="name" tickFormatter={shortName} tick={{ fontSize: 11, fill: CHART_CHROME.axis }} axisLine={{ stroke: CHART_CHROME.gridline }} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 12, fill: CHART_CHROME.axis }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="estimatedHours" name="Estimated" fill={CATEGORICAL.blue} radius={[4, 4, 0, 0]} />
            <Bar dataKey="actualHours" name="Actual" fill={CATEGORICAL.orange} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
