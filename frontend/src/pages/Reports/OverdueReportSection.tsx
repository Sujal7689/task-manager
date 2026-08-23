import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface OverdueBuckets {
  "1-3": { id: string; taskNumber: string; name: string }[];
  "4-7": { id: string; taskNumber: string; name: string }[];
  "7+": { id: string; taskNumber: string; name: string }[];
}

export default function OverdueReportSection() {
  const [overdue, setOverdue] = useState<OverdueBuckets | null>(null);

  useEffect(() => {
    api.get<OverdueBuckets>("/reports/overdue").then((res) => setOverdue(res.data));
  }, []);

  const total = overdue ? overdue["1-3"].length + overdue["4-7"].length + overdue["7+"].length : 0;

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Overdue Report</h2>
      <p className="text-sm text-slate-500 mb-4">
        Every overdue task, grouped by how many days it's been overdue. Click a bucket to see the tasks.
      </p>

      {overdue ? (
        <div className="grid sm:grid-cols-3 gap-4">
          {(["1-3", "4-7", "7+"] as const).map((bucket) => {
            const minDays = bucket === "1-3" ? 1 : bucket === "4-7" ? 4 : 7;
            return (
              <Link
                key={bucket}
                to={`/tasks?overdueDays=${minDays}`}
                className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:bg-slate-50"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{bucket} days overdue</p>
                <p className={`text-3xl font-semibold ${overdue[bucket].length > 0 ? "text-red-600" : "text-slate-900"}`}>
                  {overdue[bucket].length}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Loading...</p>
      )}

      {overdue && total === 0 && <p className="text-sm text-slate-400 mt-4">Nothing overdue right now.</p>}
    </div>
  );
}
