import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useLeadDateFilter } from "./leadDateFilter";
import KanbanBoard, { KanbanColumnData } from "./KanbanBoard";
import GroupedByStaffList from "./GroupedByStaffList";
import AssignmentOverviewWidget from "./widgets/AssignmentOverviewWidget";
import ActivityFeedWidget from "./widgets/ActivityFeedWidget";
import ConversionRateWidget from "./widgets/ConversionRateWidget";
import StageWiseWidget from "./widgets/StageWiseWidget";

const VIEWS = [
  { key: "widgets", label: "Widgets" },
  { key: "kanban", label: "Kanban" },
  { key: "by-staff", label: "By Staff" },
] as const;
type View = (typeof VIEWS)[number]["key"];

export default function DashboardSection() {
  const [view, setView] = useState<View>("widgets");

  return (
    <div>
      <div className="flex gap-1 mb-4 text-xs">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`px-3 py-1.5 rounded-lg border ${
              view === v.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "widgets" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <AssignmentOverviewWidget />
          <ActivityFeedWidget />
          <ConversionRateWidget />
          <StageWiseWidget />
        </div>
      )}
      {view === "kanban" && <DashboardKanban />}
      {view === "by-staff" && <GroupedByStaffList />}
    </div>
  );
}

function DashboardKanban() {
  const { createdSince, createdBefore, staffName, country, leadQuality, assignment } = useLeadDateFilter();
  const [columns, setColumns] = useState<KanbanColumnData[]>([]);

  useEffect(() => {
    api
      .get<KanbanColumnData[]>("/crm-lead-reports/kanban", { params: { createdSince, createdBefore, staffName, country, leadQuality, assignment } })
      .then((res) => setColumns(res.data));
  }, [createdSince, createdBefore, staffName, country, leadQuality, assignment]);

  return <KanbanBoard columns={columns} />;
}
