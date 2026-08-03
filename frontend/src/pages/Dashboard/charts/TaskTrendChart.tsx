import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../../api/client";
import { CATEGORICAL, CHART_CHROME } from "../../../lib/chartColors";

interface TrendWeek {
  weekStart: string;
  created: number;
  completed: number;
  due: number;
  inProgress: number;
}

export default function TaskTrendChart() {
  const [data, setData] = useState<TrendWeek[]>([]);

  useEffect(() => {
    api.get<TrendWeek[]>("/dashboard/task-trend", { params: { weeks: 8 } }).then((res) => setData(res.data));
  }, []);

  const formatted = data.map((d) => ({ ...d, label: new Date(d.weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="font-medium text-slate-900 mb-1">Task trend (last 8 weeks)</h2>
      <p className="text-xs text-slate-400 mb-3">
        Created &amp; Completed &amp; Due are per-week counts. "In Progress" is of each week's cohort still in progress today.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={formatted} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_CHROME.axis }} axisLine={{ stroke: CHART_CHROME.gridline }} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: CHART_CHROME.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CHART_CHROME.gridline}` }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="created" name="Created" stroke={CATEGORICAL.blue} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="completed" name="Completed" stroke={CATEGORICAL.aqua} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="due" name="Due" stroke={CATEGORICAL.orange} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="inProgress" name="In Progress" stroke={CATEGORICAL.yellow} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
