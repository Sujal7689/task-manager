import { Role } from "../types";

// Display-only labels — the underlying Role value (permission checks, API
// payloads, <select> option values) stays the raw enum string everywhere.
// STAFF shows as "Employee" per naming preference; the other three get a
// normal-case label too, so the UI doesn't mix one friendly word in among
// three raw ALL-CAPS codes.
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  TEAM_LEAD: "Team Lead",
  STAFF: "Employee",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}
