import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  userId: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithUser<T>(userId: string, fn: () => T): T {
  return als.run({ userId }, fn);
}

export function getCurrentUserId(): string | undefined {
  return als.getStore()?.userId;
}
