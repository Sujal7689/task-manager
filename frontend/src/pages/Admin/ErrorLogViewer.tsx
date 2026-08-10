import { Fragment, useEffect, useState } from "react";
import { api } from "../../api/client";
import Pagination from "../../components/Pagination";
import SearchInput from "../../components/SearchInput";

interface ErrorEntry {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  message: string;
  stack: string | null;
  userId: string | null;
  userRole: string | null;
  createdAt: string;
}

export default function ErrorLogViewer() {
  const [entries, setEntries] = useState<ErrorEntry[]>([]);
  const [pageInfo, setPageInfo] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 25 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function refresh() {
    api
      .get<{ data: ErrorEntry[]; total: number; page: number; pageSize: number; totalPages: number }>("/admin/error-log", {
        params: { page, pageSize: pageInfo.pageSize, search: search || undefined },
      })
      .then((res) => {
        setEntries(res.data.data);
        setPageInfo({ page: res.data.page, totalPages: res.data.totalPages, total: res.data.total, pageSize: res.data.pageSize });
      });
  }

  useEffect(refresh, [page, search]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  async function handleClear() {
    if (!confirm("Clear the entire error log? This cannot be undone.")) return;
    await api.delete("/admin/error-log");
    setExpandedId(null);
    refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-medium text-slate-900">Error Log</h2>
          <p className="text-xs text-slate-500 mt-0.5">Unexpected server errors — most recent {pageInfo.total < 500 ? pageInfo.total : 500} kept automatically.</p>
        </div>
        <div className="flex items-center gap-3">
          <SearchInput value={search} onChange={handleSearchChange} placeholder="Search by path or message..." className="input max-w-xs" />
          {entries.length > 0 && (
            <button onClick={handleClear} className="text-sm font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">
              Clear log
            </button>
          )}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Request</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Message</th>
              <th className="px-4 py-2">User</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <Fragment key={e.id}>
                <tr
                  onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-700 whitespace-nowrap">
                    <span className="text-xs font-mono text-slate-400 mr-1">{e.method}</span>
                    {e.path}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">{e.statusCode}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-600 max-w-[320px] truncate">{e.message}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{e.userRole ?? "—"}</td>
                </tr>
                {expandedId === e.id && (
                  <tr className="border-b border-slate-50 bg-slate-50">
                    <td colSpan={5} className="px-4 py-3">
                      <p className="text-xs text-slate-500 mb-1">User ID: {e.userId ?? "unauthenticated"}</p>
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all bg-white border border-slate-200 rounded-lg p-3 max-h-64 overflow-y-auto">
                        {e.stack ?? e.message}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No errors logged.</p>}
        <Pagination page={pageInfo.page} totalPages={pageInfo.totalPages} total={pageInfo.total} pageSize={pageInfo.pageSize} onPageChange={setPage} />
      </div>
    </div>
  );
}
