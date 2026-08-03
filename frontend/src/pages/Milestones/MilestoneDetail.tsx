import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Milestone, Task } from "../../types";

export default function MilestoneDetail() {
  const { id } = useParams();
  const [milestone, setMilestone] = useState<(Milestone & { tasks: Task[]; project: { id: string; name: string } }) | null>(null);

  useEffect(() => {
    api.get(`/milestones/${id}`).then((res) => setMilestone(res.data));
  }, [id]);

  if (!milestone) return <div className="text-slate-500">Loading...</div>;

  return (
    <div>
      <Link to={`/projects/${milestone.project.id}`} className="text-sm text-slate-500 hover:underline">
        ← Back to {milestone.project.name}
      </Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{milestone.name}</h1>
          <p className="text-sm text-slate-500">
            Status: {milestone.status} · Progress: {milestone.computedProgress ?? 0}%
          </p>
        </div>
        <Link
          to={`/tasks/new?milestoneId=${milestone.id}`}
          className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800"
        >
          New Task
        </Link>
      </div>

      <div className="w-full bg-slate-100 rounded-full h-2 mb-6">
        <div className="bg-slate-900 h-2 rounded-full" style={{ width: `${milestone.computedProgress ?? 0}%` }} />
      </div>

      <h2 className="font-medium text-slate-900 mb-3">Tasks</h2>
      <ul className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl">
        {milestone.tasks.map((t) => (
          <li key={t.id}>
            <Link to={`/tasks/${t.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <span className="text-sm text-slate-800">{t.taskNumber} — {t.name}</span>
              <span className="text-xs text-slate-500">{t.status} · {t.percentComplete}%</span>
            </Link>
          </li>
        ))}
        {milestone.tasks.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">No tasks yet.</li>}
      </ul>
    </div>
  );
}
