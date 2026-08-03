import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface ProjectProgress {
  id: string;
  name: string;
  status: string;
  totalTasks: number;
  completedTasks: number;
  progress: number;
  isDelayed: boolean;
}

export default function ProjectProgressWidget() {
  const [projects, setProjects] = useState<ProjectProgress[]>([]);

  useEffect(() => {
    api.get<ProjectProgress[]>("/dashboard/project-progress").then((res) => setProjects(res.data));
  }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="font-medium text-slate-900 mb-3">Project-wise progress</h2>
      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.id} className="hover:bg-slate-50 -mx-2 px-2 py-1 rounded">
            <div className="flex items-center justify-between mb-1">
              <Link to={`/projects/${p.id}`} className="text-sm text-slate-800 hover:underline">
                {p.name} {p.isDelayed && <span className="text-xs text-red-600 ml-1">(delayed)</span>}
              </Link>
              <Link to={`/tasks?projectId=${p.id}`} className="text-xs text-slate-500 hover:underline">
                {p.completedTasks}/{p.totalTasks} · {p.progress}%
              </Link>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full ${p.isDelayed ? "bg-red-500" : "bg-slate-900"}`} style={{ width: `${p.progress}%` }} />
            </div>
          </div>
        ))}
        {projects.length === 0 && <p className="text-sm text-slate-400 py-2">No projects visible yet.</p>}
      </div>
    </div>
  );
}
