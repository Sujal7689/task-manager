import AttendanceReportView from "../../components/AttendanceReportView";

export default function AttendanceReportSection() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Attendance Report</h2>
      <p className="text-sm text-slate-500 mb-4">
        Daily, weekly, or monthly attendance for everyone you have visibility into &mdash; Admins see the whole
        organization, reporting managers see their own direct reports.
      </p>
      <AttendanceReportView />
    </div>
  );
}
