import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../../../api/client";
import { STATUS_COLORS } from "../../../lib/chartColors";

interface StatusCount {
  status: string;
  count: number;
}

export default function StatusPieChart() {
  const navigate = useNavigate();
  const [data, setData] = useState<StatusCount[]>([]);

  useEffect(() => {
    api.get<StatusCount[]>("/dashboard/status-distribution").then((res) => setData(res.data));
  }, []);

  const nonZero = data.filter((d) => d.count > 0);
  const label = (s: string) => s.replace("_", " ");

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="font-medium text-slate-900 mb-3">Task status</h2>
      {nonZero.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No tasks yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={nonZero}
              dataKey="count"
              nameKey="status"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              cursor="pointer"
              onClick={(entry) => navigate(`/tasks?status=${(entry as unknown as StatusCount).status}`)}
              label={(props: { status?: string; percent?: number }) => `${label(props.status ?? "")} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
              style={{ fontSize: 11 }}
            >
              {nonZero.map((d) => (
                <Cell key={d.status} fill={STATUS_COLORS[d.status]} stroke="#fff" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              formatter={((value: unknown, name: unknown) => [value, label(String(name))]) as never}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend formatter={(value: string) => label(value)} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
