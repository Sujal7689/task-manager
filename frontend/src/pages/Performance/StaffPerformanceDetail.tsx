import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

interface TrendPoint {
  month: string;
  totalClosed: number;
  onTimePct: number;
  estimateAccuracy: number;
  qualityScore: number;
  volumeScore: number;
  kpiScore: number;
}

export default function StaffPerformanceDetail() {
  const { userId } = useParams();
  const { user } = useAuth();
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const targetUserId = userId ?? user?.id;

  useEffect(() => {
    api.get<TrendPoint[]>("/reports/staff-performance", { params: { userId: targetUserId } }).then((res) => setTrend(res.data));
  }, [targetUserId]);

  const latest = trend[trend.length - 1];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Staff Performance</h1>

      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Metric label="KPI Score" value={latest.kpiScore.toFixed(1)} />
          <Metric label="On-time %" value={`${latest.onTimePct.toFixed(0)}%`} />
          <Metric label="Volume score" value={`${latest.volumeScore.toFixed(0)}%`} />
          <Metric label="Quality score" value={`${latest.qualityScore.toFixed(0)}%`} />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-medium text-slate-900 mb-4">KPI trend (last 6 months)</h2>
        <div className="space-y-2">
          {trend.map((t) => (
            <div key={t.month} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-16 shrink-0">{t.month}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-3">
                <div className="bg-slate-900 h-3 rounded-full" style={{ width: `${Math.min(100, t.kpiScore)}%` }} />
              </div>
              <span className="text-xs text-slate-600 w-10 text-right">{t.kpiScore.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
