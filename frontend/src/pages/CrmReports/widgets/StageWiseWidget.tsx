import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../../api/client";
import { CATEGORICAL, CHART_CHROME } from "../../../lib/chartColors";
import { useLeadDateFilter } from "../leadDateFilter";
import { STAGE_LABELS } from "../funnelStages";

interface StageWise {
  funnel: { stage: string; count: number }[];
  dropped: number;
  other: number;
  movementsLast24h: { fromStage: string | null; toStage: string; count: number }[];
}

const FUNNEL_COLORS = [CATEGORICAL.blue, CATEGORICAL.aqua, CATEGORICAL.yellow, CATEGORICAL.orange, CATEGORICAL.green];

export default function StageWiseWidget() {
  const [data, setData] = useState<StageWise | null>(null);
  const { createdSince, createdBefore, staffName, country, leadQuality, assignment } = useLeadDateFilter();

  useEffect(() => {
    api
      .get<StageWise>("/crm-lead-reports/dashboard/stage-wise", { params: { createdSince, createdBefore, staffName, country, leadQuality, assignment } })
      .then((res) => setData(res.data));
  }, [createdSince, createdBefore, staffName, country, leadQuality, assignment]);

  if (!data) return null;

  const chartData = data.funnel.map((f, i) => ({ stage: STAGE_LABELS[f.stage] ?? f.stage, count: f.count, color: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 h-[440px] flex flex-col">
      <h2 className="font-medium text-slate-900 mb-1 shrink-0">Stage-wise funnel</h2>
      <p className="text-xs text-slate-400 mb-3 shrink-0">
        Pre-Qualified through Convert. {data.dropped} dropped (Lost/Junk/Not Qualified), {data.other} in other working statuses (not shown).
      </p>
      <div className="h-[190px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={CHART_CHROME.gridline} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12, fill: CHART_CHROME.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="stage" width={110} tick={{ fontSize: 12, fill: CHART_CHROME.axis }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CHART_CHROME.gridline}` }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {chartData.map((d) => (
                <Cell key={d.stage} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3 className="text-sm font-medium text-slate-700 mt-3 mb-2 shrink-0">Movement in the last 24 hours</h3>
      {data.movementsLast24h.length === 0 ? (
        <p className="text-xs text-slate-400">No stage changes in the last 24 hours.</p>
      ) : (
        <ul className="text-sm divide-y divide-slate-50 flex-1 min-h-0 overflow-y-auto">
          {data.movementsLast24h.map((m, i) => (
            <li key={i} className="py-1.5 flex items-center justify-between">
              <span className="text-slate-600">
                {m.fromStage ?? "(new)"} → {m.toStage}
              </span>
              <span className="font-medium text-slate-800">{m.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
