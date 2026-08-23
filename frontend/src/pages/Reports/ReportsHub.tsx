import { useSearchParams } from "react-router-dom";
import TaskReportSection from "./TaskReportSection";
import TimesheetReportSection from "./TimesheetReportSection";
import AttendanceReportSection from "./AttendanceReportSection";
import OverdueReportSection from "./OverdueReportSection";
import KpiReportSection from "./KpiReportSection";

const reportTabs = [
  { key: "kpi", label: "KPI Report", Component: KpiReportSection },
  { key: "tasks", label: "Task Report", Component: TaskReportSection },
  { key: "timesheet", label: "Timesheet Report", Component: TimesheetReportSection },
  { key: "attendance", label: "Attendance Report", Component: AttendanceReportSection },
  { key: "overdue", label: "Overdue Report", Component: OverdueReportSection },
] as const;

type ReportKey = (typeof reportTabs)[number]["key"];

function isReportKey(value: string | null): value is ReportKey {
  return reportTabs.some((t) => t.key === value);
}

export default function ReportsHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("report");
  const active: ReportKey = isReportKey(requested) ? requested : "tasks";

  function selectReport(key: ReportKey) {
    setSearchParams({ report: key }, { replace: true });
  }

  const ActiveComponent = reportTabs.find((t) => t.key === active)!.Component;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-1">Reports</h1>
      <p className="text-sm text-slate-500 mb-6">Pick a report below. CSV exports open Excel-ready.</p>

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

        <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl p-5">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
