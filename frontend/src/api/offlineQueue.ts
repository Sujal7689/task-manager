// Offline queueing for Activity Log submissions (Section 7: mobile field staff
// may lose connectivity mid-log). Entries that fail to POST due to a network
// error are queued in localStorage and flushed automatically when back online.
import { api } from "./client";

const QUEUE_KEY = "activityLogQueue";

interface QueuedEntry {
  id: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

function readQueue(): QueuedEntry[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEntry[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueuedCount(): number {
  return readQueue().length;
}

export function queueActivityLog(payload: Record<string, unknown>) {
  const queue = readQueue();
  queue.push({ id: crypto.randomUUID(), payload, queuedAt: new Date().toISOString() });
  writeQueue(queue);
}

function isNetworkError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "request" in err && !("response" in (err as { response?: unknown }));
}

export async function submitActivityLog(payload: Record<string, unknown>): Promise<{ queued: boolean; id?: string }> {
  try {
    const res = await api.post("/activity-logs", payload);
    return { queued: false, id: res.data.id };
  } catch (err) {
    if (isNetworkError(err) || !navigator.onLine) {
      queueActivityLog(payload);
      return { queued: true };
    }
    throw err;
  }
}

export async function flushActivityLogQueue(): Promise<number> {
  const queue = readQueue();
  if (queue.length === 0) return 0;

  const remaining: QueuedEntry[] = [];
  let flushed = 0;
  for (const entry of queue) {
    try {
      await api.post("/activity-logs", entry.payload);
      flushed++;
    } catch (err) {
      if (isNetworkError(err)) {
        remaining.push(entry); // still offline — keep it and stop trying further ones for now
        remaining.push(...queue.slice(queue.indexOf(entry) + 1));
        break;
      }
      // A real validation/server error: drop it rather than retry forever.
    }
  }
  writeQueue(remaining);
  return flushed;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushActivityLogQueue();
  });
}
