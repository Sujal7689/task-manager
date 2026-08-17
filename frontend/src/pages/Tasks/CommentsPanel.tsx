import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { User } from "../../types";
import { useToast } from "../../context/ToastContext";

interface Comment {
  id: string;
  authorId: string;
  body: string;
  mentionedUserIds: string[];
  createdAt: string;
}

export default function CommentsPanel({ taskId }: { taskId: string }) {
  const { showToast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [body, setBody] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function refresh() {
    api.get<Comment[]>(`/comments/task/${taskId}`).then((res) => setComments(res.data));
  }

  useEffect(() => {
    refresh();
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, [taskId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || saving) return;
    setSaving(true);
    try {
      await api.post("/comments", { taskId, body, mentionedUserIds });
      setBody("");
      setMentionedUserIds([]);
      refresh();
      showToast("Comment posted.");
    } finally {
      setSaving(false);
    }
  }

  function toggleMention(userId: string) {
    setMentionedUserIds((prev) => (prev.includes(userId) ? prev.filter((u) => u !== userId) : [...prev, userId]));
  }

  function userName(id: string) {
    return users.find((u) => u.id === id)?.name ?? "someone";
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a comment..."
          className="input mb-3"
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-500 self-center">Mention:</span>
            {users.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => toggleMention(u.id)}
                className={`text-xs px-2 py-1 rounded-full border ${
                  mentionedUserIds.includes(u.id) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"
                }`}
              >
                @{u.name}
              </button>
            ))}
          </div>
          <button type="submit" disabled={saving} className="text-sm font-medium bg-slate-900 text-white px-4 py-2 rounded-lg disabled:opacity-50">
            {saving ? "Posting..." : "Post"}
          </button>
        </div>
      </form>

      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-medium text-slate-900">{userName(c.authorId)}</p>
            <p className="text-sm text-slate-800 mt-1">{c.body}</p>
            {c.mentionedUserIds.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                Mentioned: {c.mentionedUserIds.map((id) => `@${userName(id)}`).join(", ")}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">{new Date(c.createdAt).toLocaleString()}</p>
          </li>
        ))}
        {comments.length === 0 && <p className="text-sm text-slate-400">No comments yet.</p>}
      </ul>
    </div>
  );
}
