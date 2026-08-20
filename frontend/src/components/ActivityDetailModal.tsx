import { apiBaseUrl } from "../api/client";

export interface ActivityDetailAttachment {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
}

export interface ActivityDetailRow {
  label: string;
  value: React.ReactNode;
}

export default function ActivityDetailModal({
  title,
  subtitle,
  rows,
  attachments,
  onClose,
}: {
  title: string;
  subtitle?: string;
  rows: ActivityDetailRow[];
  attachments: ActivityDetailAttachment[];
  onClose: () => void;
}) {
  const uploadsOrigin = apiBaseUrl.replace(/\/api\/?$/, "");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {rows
            .filter((r) => r.value !== null && r.value !== undefined && r.value !== "")
            .map((r) => (
              <div key={r.label} className="grid grid-cols-3 gap-2 text-sm">
                <span className="text-slate-500">{r.label}</span>
                <span className="col-span-2 text-slate-800">{r.value}</span>
              </div>
            ))}

          <div className="grid grid-cols-3 gap-2 text-sm items-start">
            <span className="text-slate-500">Attachments</span>
            <div className="col-span-2">
              {attachments.length === 0 ? (
                <span className="text-slate-400">None</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <a
                      key={a.id}
                      href={`${uploadsOrigin}/${a.filePath}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-600 hover:underline border border-slate-200 rounded-full px-2 py-1"
                    >
                      {a.fileName} <span className="text-slate-400">({Math.round(a.fileSize / 1024)} KB)</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
