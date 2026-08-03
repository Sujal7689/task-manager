import { ChangeEvent, useRef, useState } from "react";
import { api, apiBaseUrl } from "../../api/client";
import { Task } from "../../types";

export default function AttachmentsPanel({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachments = task.attachments ?? [];

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/tasks/${task.id}/attachments`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      onChanged();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(attachmentId: string) {
    await api.delete(`/tasks/${task.id}/attachments/${attachmentId}`);
    onChanged();
  }

  const uploadsOrigin = apiBaseUrl.replace(/\/api\/?$/, "");

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">Files attached to this task.</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-sm font-medium bg-slate-900 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "+ Upload file"}
        </button>
        <input ref={fileInputRef} type="file" onChange={handleUpload} className="hidden" />
      </div>
      <ul className="divide-y divide-slate-100">
        {attachments.map((a) => (
          <li key={a.id} className="flex items-center justify-between py-2">
            <a href={`${uploadsOrigin}/${a.filePath}`} target="_blank" rel="noreferrer" className="text-sm text-slate-800 hover:underline">
              {a.fileName} <span className="text-xs text-slate-400">({Math.round(a.fileSize / 1024)} KB)</span>
            </a>
            <button onClick={() => handleDelete(a.id)} className="text-xs text-red-500 hover:underline">Remove</button>
          </li>
        ))}
        {attachments.length === 0 && <p className="text-sm text-slate-400 py-2">No attachments yet.</p>}
      </ul>
    </div>
  );
}
