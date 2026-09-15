import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { DEFAULT_CUTOFF_DATE, useLeadDateFilter } from "./leadDateFilter";

interface StaffOption {
  staffName: string;
}

const QUALITY_OPTIONS = [
  { value: "POTENTIAL_DEAL", label: "Potential Deal" },
  { value: "NURTURING", label: "Nurturing" },
  { value: "UNQUALIFIED", label: "Lead Unqualified" },
] as const;

// Visible on every CRM Reports tab (rendered once in CrmReportsHub) — date
// range applies uniformly to the Dashboard widgets, the Lead-wise selector,
// and the Staff-wise overview; the staff/country/quality dropdowns apply
// everywhere including Daily Report / Closure Report, which don't use the
// date range (`showDateRange={false}` hides just that half of the bar).
export default function LeadDateFilterBar({ showDateRange = true }: { showDateRange?: boolean }) {
  const [, setSearchParams] = useSearchParams();
  const { on, date, dateTo, staffFilter, countryFilter, qualityFilter } = useLeadDateFilter();
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);

  useEffect(() => {
    api.get<StaffOption[]>("/crm-lead-reports/staff").then((res) => setStaffOptions(res.data.map((s) => s.staffName).sort()));
    api.get<string[]>("/crm-lead-reports/countries").then((res) => setCountryOptions(res.data));
  }, []);

  function updateDateRange(next: { on?: boolean; date?: string; dateTo?: string }) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("cutoffOn", (next.on ?? on) ? "1" : "0");
      params.set("cutoffDate", next.date ?? date);
      const nextDateTo = next.dateTo ?? dateTo;
      if (nextDateTo) params.set("cutoffDateTo", nextDateTo);
      else params.delete("cutoffDateTo");
      return params;
    });
  }

  // Shared setter for the simple "select a value or clear it" filters
  // (staff/country/quality) — each just sets or deletes its own URL param.
  function setParam(key: "staffFilter" | "countryFilter" | "qualityFilter", value: string) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (value) params.set(key, value);
      else params.delete(key);
      return params;
    });
  }

  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 mb-4 text-sm flex-wrap">
      {showDateRange && (
        <>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={on} onChange={(e) => updateDateRange({ on: e.target.checked })} className="h-4 w-4" />
            <span className="font-medium text-slate-700">Leads created</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => updateDateRange({ date: e.target.value })}
            disabled={!on}
            className="input w-auto py-1 disabled:opacity-50"
          />
          <span className={!on ? "text-slate-300" : "text-slate-400"}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => updateDateRange({ dateTo: e.target.value })}
            disabled={!on}
            placeholder="today"
            className="input w-auto py-1 disabled:opacity-50"
          />
          {!on && (
            <span className="text-xs text-slate-400">
              Showing every lead. <button onClick={() => updateDateRange({ on: true })} className="underline hover:text-slate-600">Turn back on</button>
            </span>
          )}
          {(date !== DEFAULT_CUTOFF_DATE || dateTo) && (
            <button
              onClick={() => updateDateRange({ date: DEFAULT_CUTOFF_DATE, dateTo: "" })}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              Reset dates
            </button>
          )}
          <span className="w-px h-5 bg-slate-200" />
        </>
      )}
      <label className="flex items-center gap-2">
        <span className="text-slate-600">Staff</span>
        <select value={staffFilter} onChange={(e) => setParam("staffFilter", e.target.value)} className="input w-auto py-1">
          <option value="">All staff</option>
          {staffOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {staffFilter && (
        <button onClick={() => setParam("staffFilter", "")} className="text-xs text-slate-400 underline hover:text-slate-600">
          Clear staff
        </button>
      )}
      <label className="flex items-center gap-2">
        <span className="text-slate-600">Country</span>
        <select value={countryFilter} onChange={(e) => setParam("countryFilter", e.target.value)} className="input w-auto py-1">
          <option value="">All countries</option>
          {countryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      {countryFilter && (
        <button onClick={() => setParam("countryFilter", "")} className="text-xs text-slate-400 underline hover:text-slate-600">
          Clear country
        </button>
      )}
      <label className="flex items-center gap-2">
        <span className="text-slate-600">Quality</span>
        <select value={qualityFilter} onChange={(e) => setParam("qualityFilter", e.target.value)} className="input w-auto py-1">
          <option value="">All qualities</option>
          {QUALITY_OPTIONS.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </select>
      </label>
      {qualityFilter && (
        <button onClick={() => setParam("qualityFilter", "")} className="text-xs text-slate-400 underline hover:text-slate-600">
          Clear quality
        </button>
      )}
    </div>
  );
}
