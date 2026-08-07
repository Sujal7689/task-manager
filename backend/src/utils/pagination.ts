const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
}

// Pagination is opt-in: only kicks in when `page` is present in the query
// string. Many places in the app fetch a full list just to populate a
// dropdown (Project/User pickers, etc.) — those callers don't pass `page`,
// so they keep getting a plain array with no code changes needed on their end.
export function parsePagination(query: Record<string, unknown>): PageRequest | null {
  if (query.page == null) return null;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function parseSearch(query: Record<string, unknown>): string | undefined {
  const value = query.search;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function toPaginated<T>(data: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { data, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
