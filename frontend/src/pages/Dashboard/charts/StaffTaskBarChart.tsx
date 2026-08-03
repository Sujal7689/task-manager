import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../../api/client";
import { CATEGORICAL, CHART_CHROME } from "../../../lib/chartColors";

interface MemberSummary {
  userId: string;
  name: string;
  totalTasks: number;
}

export default function StaffTaskBarChart() {
  const navigate = useNavigate();
  const [data, setData] = useState<MemberSummary[]>([]);

  useEffect(() => {
    api.get<MemberSummary[]>("/dashboard/member-kpi", { params: { period: "MONTHLY" } }).then((res) => setData(res.data));
  }, []);

  const shortName = (n: string) => (n.length > 12 ? `${n.slice(0, 11)}…` : n);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="font-medium text-slate-900 mb-3">Staff-wise tasks</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
          <XAxis
            dataKey="name"
            tickFormatter={shortName}
            tick={{ fontSize: 11, fill: CHART_CHROME.axis }}
            axisLine={{ stroke: CHART_CHROME.gridline }}
            tickLine={false}
            interval={0}
          />
          <YAxis tick={{ fontSize: 12, fill: CHART_CHROME.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CHART_CHROME.gridline}` }} />
          <Bar
            dataKey="totalTasks"
            name="Tasks"
            fill={CATEGORICAL.blue}
            radius={[4, 4, 0, 0]}
            cursor="pointer"
            onClick={(entry) => navigate(`/tasks?assigneeId=${(entry as unknown as MemberSummary).userId}`)}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
