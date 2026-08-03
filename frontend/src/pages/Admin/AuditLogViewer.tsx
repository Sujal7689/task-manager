import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  changedBy: { name: string };
}

export default function AuditLogViewer() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    api.get<AuditEntry[]>("/admin/audit-log").then((res) => setEntries(res.data));
  }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
            <th className="px-4 py-2">Entity</th>
            <th className="px-4 py-2">Field</th>
            <th className="px-4 py-2">Old</th>
            <th className="px-4 py-2">New</th>
            <th className="px-4 py-2">Changed by</th>
            <th className="px-4 py-2">When</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-slate-50">
              <td className="px-4 py-2">{e.entityType} <span className="text-xs text-slate-400">{e.entityId.slice(0, 8)}</span></td>
              <td className="px-4 py-2">{e.fieldChanged}</td>
              <td className="px-4 py-2 text-slate-500 max-w-[160px] truncate">{e.oldValue ?? "—"}</td>
              <td className="px-4 py-2 text-slate-500 max-w-[160px] truncate">{e.newValue ?? "—"}</td>
              <td className="px-4 py-2">{e.changedBy.name}</td>
              <td className="px-4 py-2 text-xs text-slate-400">{new Date(e.changedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No audit entries yet.</p>}
    </div>
  );
}
