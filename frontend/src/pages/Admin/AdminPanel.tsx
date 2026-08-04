import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import UserManagement from "./UserManagement";
import MasterData from "./MasterData";
import KpiEscalationConfig from "./KpiEscalationConfig";
import ZohoIntegration from "./ZohoIntegration";
import AuditLogViewer from "./AuditLogViewer";
import Configuration from "./Configuration";

const tabs = ["Users", "Master Data", "KPI & Escalation", "Zoho CRM", "Configuration", "Audit Log"] as const;
type Tab = (typeof tabs)[number];

export default function AdminPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("Users");

  if (user?.role !== "ADMIN") {
    return <p className="text-sm text-slate-500">Admin access only.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Admin</h1>
      <div className="flex gap-4 border-b border-slate-200 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm font-medium pb-2 border-b-2 whitespace-nowrap ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Users" && <UserManagement />}
      {tab === "Master Data" && <MasterData />}
      {tab === "KPI & Escalation" && <KpiEscalationConfig />}
      {tab === "Zoho CRM" && <ZohoIntegration />}
      {tab === "Configuration" && <Configuration />}
      {tab === "Audit Log" && <AuditLogViewer />}
    </div>
  );
}
