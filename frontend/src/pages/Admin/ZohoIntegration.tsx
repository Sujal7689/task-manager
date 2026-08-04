import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Status {
  configured: boolean;
  lastSync: { syncedAt: string; status: string } | null;
  recentFailures: number;
}

interface SyncLogEntry {
  id: string;
  zohoTaskId: string;
  localTaskId: string | null;
  status: "SUCCESS" | "FAILED";
  errorMessage: string | null;
  syncedAt: string;
}

export default function ZohoIntegration() {
  const [status, setStatus] = useState<Status | null>(null);
  const [log, setLog] = useState<SyncLogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    api.get<Status>("/admin/zoho/status").then((res) => setStatus(res.data));
    api.get<SyncLogEntry[]>("/admin/zoho/sync-log").then((res) => setLog(res.data));
  }
  useEffect(refresh, []);

  async function triggerSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await api.post("/admin/zoho/sync");
      setMessage(`Synced ${res.data.synced} task(s) from Zoho.`);
      refresh();
    } catch {
      setMessage("Sync failed — check that Zoho credentials are configured in .env.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-slate-900">Connection status</h3>
          <button
            onClick={triggerSync}
            disabled={syncing || !status?.configured}
            className="text-sm font-medium bg-slate-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Run sync now"}
          </button>
        </div>
        {!status?.configured && (
          <p className="text-sm text-amber-600 mb-2">
            Not connected. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in .env (obtained via Zoho's
            API console self-client OAuth flow), then restart the backend.
          </p>
        )}
        {message && <p className="text-sm text-slate-600 mb-2">{message}</p>}
        {status && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-400">Last sync</dt><dd>{status.lastSync ? new Date(status.lastSync.syncedAt).toLocaleString() : "—"}</dd></div>
            <div><dt className="text-xs text-slate-400">Failures (24h)</dt><dd className={status.recentFailures > 0 ? "text-red-600" : ""}>{status.recentFailures}</dd></div>
          </dl>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl">
        <h3 className="font-medium text-slate-900 px-4 pt-4 pb-2">Sync log</h3>
        <ul className="divide-y divide-slate-100">
          {log.map((l) => (
            <li key={l.id} className="px-4 py-2 text-sm flex items-center justify-between">
              <span>Zoho task {l.zohoTaskId}</span>
              <span className={l.status === "SUCCESS" ? "text-green-600" : "text-red-600"}>
                {l.status} {l.errorMessage && `— ${l.errorMessage}`}
              </span>
              <span className="text-xs text-slate-400">{new Date(l.syncedAt).toLocaleString()}</span>
            </li>
          ))}
          {log.length === 0 && <li className="px-4 py-6 text-sm text-slate-400">No sync attempts yet.</li>}
        </ul>
      </div>
    </div>
  );
}
