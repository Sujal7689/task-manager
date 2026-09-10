import { useSearchParams } from "react-router-dom";
import DashboardSection from "./DashboardSection";
import LeadWiseSection from "./LeadWiseSection";
import StaffWiseSection from "./StaffWiseSection";
import DailyReportSection from "./DailyReportSection";
import ClosureReportSection from "./ClosureReportSection";
import LeadDateFilterBar from "./LeadDateFilterBar";

const reportTabs = [
  { key: "dashboard", label: "Dashboard", Component: DashboardSection, showDateRange: true },
  { key: "lead-wise", label: "Lead-wise", Component: LeadWiseSection, showDateRange: true },
  { key: "staff-wise", label: "Staff-wise", Component: StaffWiseSection, showDateRange: true },
  { key: "daily-report", label: "Daily Report", Component: DailyReportSection, showDateRange: false },
  { key: "closure-report", label: "Closure Report", Component: ClosureReportSection, showDateRange: false },
] as const;

type ReportKey = (typeof reportTabs)[number]["key"];

function isReportKey(value: string | null): value is ReportKey {
  return reportTabs.some((t) => t.key === value);
}

const FILTER_PARAM_KEYS = ["cutoffOn", "cutoffDate", "cutoffDateTo", "staffFilter"] as const;

export default function CrmReportsHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("report");
  const active: ReportKey = isReportKey(requested) ? requested : "dashboard";

  function selectReport(key: ReportKey) {
    // Preserve the shared date/staff filters across tab switches (they're
    // global); drop tab-specific selections like leadId/staffName (Staff-wise's
    // drill-down selection) since those don't carry meaning on a different tab.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams();
        next.set("report", key);
        for (const filterKey of FILTER_PARAM_KEYS) {
          const v = prev.get(filterKey);
          if (v !== null) next.set(filterKey, v);
        }
        return next;
      },
      { replace: true },
    );
  }

  const activeTab = reportTabs.find((t) => t.key === active)!;
  const ActiveComponent = activeTab.Component;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-1">CRM Leads Reports</h1>
      <p className="text-sm text-slate-500 mb-6">Synced from Zoho CRM's Leads module.</p>

      <LeadDateFilterBar showDateRange={activeTab.showDateRange} />

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 sm:hidden">
        {reportTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => selectReport(t.key)}
            className={`text-sm px-3 py-1.5 rounded-lg whitespace-nowrap ${
              active === t.key ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start">
        <nav className="w-48 shrink-0 hidden sm:block">
          <ul className="space-y-1">
            {reportTabs.map((t) => (
              <li key={t.key}>
                <button
                  onClick={() => selectReport(t.key)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg ${
                    active === t.key ? "bg-slate-900 text-white font-medium" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1 min-w-0">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
