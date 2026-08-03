import { Link } from "react-router-dom";
import { Task, TaskStatus } from "../../types";

const columns: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "UNDER_REVIEW", "COMPLETED", "CANCELLED"];

const priorityColor: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-50 text-blue-700",
  HIGH: "bg-orange-50 text-orange-700",
  CRITICAL: "bg-red-50 text-red-700",
};

export default function KanbanBoard({ tasks }: { tasks: Task[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((status) => {
        const columnTasks = tasks.filter((t) => t.status === status);
        return (
          <div key={status} className="bg-slate-100 rounded-xl p-3 w-64 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{status.replace("_", " ")}</h3>
              <span className="text-xs text-slate-400">{columnTasks.length}</span>
            </div>
            <div className="space-y-2">
              {columnTasks.map((t) => (
                <Link
                  key={t.id}
                  to={`/tasks/${t.id}`}
                  className="block bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm"
                >
                  <p className="text-xs text-slate-400 mb-0.5">{t.taskNumber}</p>
                  <p className="text-sm font-medium text-slate-900 mb-2">{t.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColor[t.priority]}`}>{t.priority}</span>
                </Link>
              ))}
              {columnTasks.length === 0 && <p className="text-xs text-slate-400 py-2">No tasks</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
