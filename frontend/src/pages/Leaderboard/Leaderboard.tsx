import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

type Period = "WEEKLY" | "MONTHLY" | "QUARTERLY";

interface Entry {
  rank: number;
  userId: string;
  name: string;
  department: string | null;
  totalClosed: number;
  onTimePct: number;
  estimateAccuracy: number;
  qualityScore: number;
  volumeScore: number;
  kpiScore: number;
}

const periods: Period[] = ["WEEKLY", "MONTHLY", "QUARTERLY"];

export default function Leaderboard() {
  const [period, setPeriod] = useState<Period>("MONTHLY");
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    api.get<Entry[]>("/leaderboard", { params: { period } }).then((res) => setEntries(res.data));
  }, [period]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Leaderboard</h1>
        <div className="flex gap-2">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-sm px-3 py-1.5 rounded-full ${period === p ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
            >
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-4">Peer scores are visible to everyone in the organization.</p>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-6 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
          <span>#</span>
          <span className="col-span-2">Name</span>
          <span>Closed</span>
          <span>On-time %</span>
          <span>KPI Score</span>
        </div>
        {entries.map((e) => (
          <Link
            key={e.userId}
            to={`/performance/${e.userId}`}
            className="grid grid-cols-6 px-4 py-3 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
          >
            <span className="text-slate-500">{e.rank}</span>
            <span className="col-span-2 text-slate-900 font-medium">{e.name} <span className="text-xs text-slate-400">({e.department ?? "—"})</span></span>
            <span className="text-slate-600">{e.totalClosed}</span>
            <span className="text-slate-600">{e.onTimePct.toFixed(0)}%</span>
            <span className="font-semibold text-slate-900">{e.kpiScore.toFixed(1)}</span>
          </Link>
        ))}
        {entries.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No data for this period yet.</p>}
      </div>
    </div>
  );
}
