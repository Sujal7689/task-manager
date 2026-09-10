import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../../api/client";
import { CATEGORICAL, CHART_CHROME } from "../../../lib/chartColors";
import { useLeadDateFilter } from "../leadDateFilter";

interface Point {
  period: string;
  created: number;
  converted: number;
  rate: number;
}

export default function ConversionRateWidget() {
  const [granularity, setGranularity] = useState<"day" | "month">("day");
  const [data, setData] = useState<Point[]>([]);
  const { createdSince, createdBefore, staffName } = useLeadDateFilter();

  useEffect(() => {
    api
      .get<Point[]>("/crm-lead-reports/dashboard/conversion-rate", { params: { granularity, createdSince, createdBefore, staffName } })
      .then((res) => setData(res.data));
  }, [granularity, createdSince, createdBefore, staffName]);

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.period).toLocaleDateString(undefined, granularity === "day" ? { month: "short", day: "numeric" } : { month: "short", year: "2-digit" }),
  }));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 h-[440px] flex flex-col">
      <div className="flex items-center justify-between mb-1 gap-3 shrink-0">
        <h2 className="font-medium text-slate-900">Conversion rate</h2>
        <div className="flex gap-1 text-xs">
          {(["day", "month"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-2 py-1 rounded-lg border ${granularity === g ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`}
            >
              By {g}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-3 shrink-0">Leads converted in a period ÷ leads created in that same period. Not a cohort of the same leads.</p>
      {formatted.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No data in this window yet.</p>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={formatted} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_CHROME.axis }} axisLine={{ stroke: CHART_CHROME.gridline }} tickLine={false} />
              <YAxis yAxisId="count" tick={{ fontSize: 12, fill: CHART_CHROME.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 12, fill: CHART_CHROME.axis }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CHART_CHROME.gridline}` }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="count" dataKey="created" name="Created" fill={CATEGORICAL.blue} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="count" dataKey="converted" name="Converted" fill={CATEGORICAL.aqua} radius={[3, 3, 0, 0]} />
              <Line yAxisId="rate" type="monotone" dataKey="rate" name="Rate %" stroke={CATEGORICAL.orange} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
