import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { Department } from "../../types";
import { useToast } from "../../context/ToastContext";

interface Weights {
  onTimeWeight: number | string;
  volumeWeight: number | string;
  qualityWeight: number | string;
}

interface EscalationRule {
  id: string;
  overdueDay: number;
  notifyDepartmentHead: boolean;
  department: { name: string } | null;
  company: { name: string } | null;
}

export default function KpiEscalationConfig() {
  const { showToast } = useToast();
  const [weights, setWeights] = useState<Weights>({ onTimeWeight: 45, volumeWeight: 30, qualityWeight: 25 });
  const [rules, setRules] = useState<EscalationRule[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [overdueDay, setOverdueDay] = useState("14");
  const [departmentId, setDepartmentId] = useState("");
  const [notifyHead, setNotifyHead] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savingWeights, setSavingWeights] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  function refresh() {
    api.get("/kpi/weights").then((res) => setWeights(res.data));
    api.get<EscalationRule[]>("/admin/escalation-rules").then((res) => setRules(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
  }
  useEffect(refresh, []);

  async function saveWeights(e: FormEvent) {
    e.preventDefault();
    if (savingWeights) return;
    setSavingWeights(true);
    try {
      await api.put("/kpi/weights", {
        onTime: Number(weights.onTimeWeight),
        volume: Number(weights.volumeWeight),
        quality: Number(weights.qualityWeight),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSavingWeights(false);
    }
  }

  async function addRule(e: FormEvent) {
    e.preventDefault();
    if (savingRule) return;
    setSavingRule(true);
    try {
      await api.post("/admin/escalation-rules", {
        departmentId: departmentId || undefined,
        overdueDay: Number(overdueDay),
        notifyDepartmentHead: notifyHead,
      });
      refresh();
      showToast("Escalation rule added.");
    } finally {
      setSavingRule(false);
    }
  }

  async function deleteRule(id: string) {
    await api.delete(`/admin/escalation-rules/${id}`);
    refresh();
  }

  const total = Number(weights.onTimeWeight) + Number(weights.volumeWeight) + Number(weights.qualityWeight);

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-medium text-slate-900 mb-1">KPI weight formula</h3>
        <p className="text-xs text-slate-500 mb-3">Measured on punctuality, volume, and quality only. Defaults to 45/30/25. Should total 100.</p>
        <form onSubmit={saveWeights} className="space-y-3">
          <WeightField label="On-Time Completion %" value={weights.onTimeWeight} onChange={(v) => setWeights({ ...weights, onTimeWeight: v })} />
          <WeightField label="Task Volume" value={weights.volumeWeight} onChange={(v) => setWeights({ ...weights, volumeWeight: v })} />
          <WeightField label="Quality/Feedback" value={weights.qualityWeight} onChange={(v) => setWeights({ ...weights, qualityWeight: v })} />
          <p className={`text-xs ${total === 100 ? "text-slate-400" : "text-amber-600"}`}>Total: {total}{total !== 100 && " (should be 100)"}</p>
          <button type="submit" disabled={savingWeights} className="bg-slate-900 text-white rounded-lg py-2 px-4 text-sm font-medium disabled:opacity-50">
            {savingWeights ? "Saving..." : "Save weights"}
          </button>
          {saved && <span className="text-sm text-green-600 ml-3">Saved.</span>}
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-medium text-slate-900 mb-1">Escalation rules</h3>
        <p className="text-xs text-slate-500 mb-3">Defaults (Day 1/3/7) are built in. Add extra thresholds per department here.</p>
        <form onSubmit={addRule} className="grid grid-cols-3 gap-2 mb-3">
          <input type="number" min={1} value={overdueDay} onChange={(e) => setOverdueDay(e.target.value)} className="input" placeholder="Day" />
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="input">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button type="submit" disabled={savingRule} className="bg-slate-900 text-white rounded-lg text-sm disabled:opacity-50">
            {savingRule ? "Adding..." : "Add"}
          </button>
          <label className="col-span-3 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={notifyHead} onChange={(e) => setNotifyHead(e.target.checked)} />
            Notify Department Head
          </label>
        </form>
        <ul className="divide-y divide-slate-100">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span>Day {r.overdueDay} · {r.department?.name ?? "All departments"}{r.notifyDepartmentHead ? " · notifies head" : ""}</span>
              <button onClick={() => deleteRule(r.id)} className="text-red-500 text-xs hover:underline">Remove</button>
            </li>
          ))}
          {rules.length === 0 && <li className="text-sm text-slate-400 py-2">No custom rules — using Day 1/3/7 defaults only.</li>}
        </ul>
      </section>
    </div>
  );
}

function WeightField({ label, value, onChange }: { label: string; value: number | string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-700 mb-1 block">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}
