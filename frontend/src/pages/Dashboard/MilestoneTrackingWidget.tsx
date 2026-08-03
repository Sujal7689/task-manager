import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface MilestoneItem {
  id: string;
  name: string;
  project: string;
  status: string;
  targetDate: string | null;
  progress: number;
  atRisk: boolean;
  isOverdue: boolean;
}

export default function MilestoneTrackingWidget() {
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);

  useEffect(() => {
    api.get<MilestoneItem[]>("/dashboard/milestones-tracking").then((res) => setMilestones(res.data));
  }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="font-medium text-slate-900 mb-3">Milestone tracking</h2>
      <ul className="divide-y divide-slate-100">
        {milestones.map((m) => (
          <li key={m.id}>
            <Link to={`/milestones/${m.id}`} className="flex items-center justify-between py-2 hover:bg-slate-50 -mx-2 px-2 rounded">
              <div>
                <p className="text-sm text-slate-800">{m.name} <span className="text-xs text-slate-400">({m.project})</span></p>
                <p className="text-xs text-slate-500">
                  {m.targetDate ? new Date(m.targetDate).toLocaleDateString() : "No target date"} · {m.progress}%
                </p>
              </div>
              {(m.atRisk || m.isOverdue) && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                  {m.isOverdue ? "Overdue" : "At risk"}
                </span>
              )}
            </Link>
          </li>
        ))}
        {milestones.length === 0 && <li className="text-sm text-slate-400 py-2">No milestones visible yet.</li>}
      </ul>
    </div>
  );
}
