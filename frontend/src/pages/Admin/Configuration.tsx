import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";

interface ConfigResponse {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPasswordSet: boolean;
  smtpFrom: string;
  zohoClientId: string;
  zohoClientSecretSet: boolean;
  zohoRefreshTokenSet: boolean;
  zohoAccountsBaseUrl: string;
  zohoApiBaseUrl: string;
  notificationCronSchedule: string;
  weeklyReportCronSchedule: string;
  overrides: Record<string, boolean>;
}

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { error?: string } } };
  return axiosErr.response?.data?.error ?? fallback;
}

export default function Configuration() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPasswordInput, setSmtpPasswordInput] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");

  const [zohoClientId, setZohoClientId] = useState("");
  const [zohoClientSecretInput, setZohoClientSecretInput] = useState("");
  const [zohoRefreshTokenInput, setZohoRefreshTokenInput] = useState("");
  const [zohoAccountsBaseUrl, setZohoAccountsBaseUrl] = useState("");
  const [zohoApiBaseUrl, setZohoApiBaseUrl] = useState("");

  const [notificationCronSchedule, setNotificationCronSchedule] = useState("");
  const [weeklyReportCronSchedule, setWeeklyReportCronSchedule] = useState("");

  function refresh() {
    api.get<ConfigResponse>("/admin/config").then((res) => {
      const c = res.data;
      setConfig(c);
      setSmtpHost(c.smtpHost);
      setSmtpPort(String(c.smtpPort));
      setSmtpUser(c.smtpUser);
      setSmtpFrom(c.smtpFrom);
      setZohoClientId(c.zohoClientId);
      setZohoAccountsBaseUrl(c.zohoAccountsBaseUrl);
      setZohoApiBaseUrl(c.zohoApiBaseUrl);
      setNotificationCronSchedule(c.notificationCronSchedule);
      setWeeklyReportCronSchedule(c.weeklyReportCronSchedule);
    });
  }
  useEffect(refresh, []);

  function flashSaved(section: string) {
    setSaved(section);
    setTimeout(() => setSaved(null), 2000);
  }

  async function save(section: string, body: Record<string, unknown>) {
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      await api.put("/admin/config", body);
      flashSaved(section);
      refresh();
      setSmtpPasswordInput("");
      setZohoClientSecretInput("");
      setZohoRefreshTokenInput("");
    } catch (err) {
      setError(errorMessage(err, "Could not save configuration."));
    } finally {
      setSaving(false);
    }
  }

  // Only fields the user actually edited get sent — untouched fields are
  // omitted from the payload so they're left alone (still falling back to
  // .env if that's how they were). Otherwise saving one field in a section
  // would silently pin every sibling field in that section as a "custom"
  // override too, defeating the whole point of the .env-fallback design.
  function changedOnly(current: Record<string, string>, loaded: Record<string, string>) {
    const body: Record<string, string | null> = {};
    for (const key in current) {
      if (current[key] !== loaded[key]) body[key] = current[key] || null;
    }
    return body;
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    const changed = changedOnly(
      { smtpHost, smtpPort, smtpUser, smtpFrom },
      { smtpHost: config.smtpHost, smtpPort: String(config.smtpPort), smtpUser: config.smtpUser, smtpFrom: config.smtpFrom },
    );
    await save("email", { ...changed, ...(smtpPasswordInput ? { smtpPassword: smtpPasswordInput } : {}) });
  }

  async function saveZoho(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    const changed = changedOnly(
      { zohoClientId, zohoAccountsBaseUrl, zohoApiBaseUrl },
      { zohoClientId: config.zohoClientId, zohoAccountsBaseUrl: config.zohoAccountsBaseUrl, zohoApiBaseUrl: config.zohoApiBaseUrl },
    );
    await save("zoho", {
      ...changed,
      ...(zohoClientSecretInput ? { zohoClientSecret: zohoClientSecretInput } : {}),
      ...(zohoRefreshTokenInput ? { zohoRefreshToken: zohoRefreshTokenInput } : {}),
    });
  }

  async function saveSchedules(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    const changed = changedOnly(
      { notificationCronSchedule, weeklyReportCronSchedule },
      { notificationCronSchedule: config.notificationCronSchedule, weeklyReportCronSchedule: config.weeklyReportCronSchedule },
    );
    await save("schedules", changed);
  }

  async function clearSecret(field: "smtpPassword" | "zohoClientSecret" | "zohoRefreshToken", label: string) {
    if (!confirm(`Clear the stored ${label}? This falls back to .env (or disconnects the integration if .env is also blank). This cannot be undone.`)) return;
    await save("clear", { [field]: null });
  }

  if (!config) return <div className="text-slate-500">Loading...</div>;

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {error && <div className="sm:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-medium text-slate-900 mb-1">Email (SMTP)</h3>
        <p className="text-xs text-slate-500 mb-3">
          Used for notification and weekly summary emails. A field left blank falls back to whatever is set in <code>.env</code> on the server.
        </p>
        <form onSubmit={saveEmail} className="space-y-3">
          <ConfigField label="SMTP Host" value={smtpHost} onChange={setSmtpHost} overridden={config.overrides.smtpHost} />
          <ConfigField label="SMTP Port" value={smtpPort} onChange={setSmtpPort} type="number" overridden={config.overrides.smtpPort} />
          <ConfigField label="SMTP User" value={smtpUser} onChange={setSmtpUser} overridden={config.overrides.smtpUser} />
          <SecretField
            label="SMTP Password"
            isSet={config.smtpPasswordSet}
            overridden={config.overrides.smtpPassword}
            value={smtpPasswordInput}
            onChange={setSmtpPasswordInput}
            onClear={() => clearSecret("smtpPassword", "SMTP password")}
          />
          <ConfigField label="From Address" value={smtpFrom} onChange={setSmtpFrom} overridden={config.overrides.smtpFrom} />
          <button type="submit" disabled={saving} className="bg-slate-900 text-white rounded-lg py-2 px-4 text-sm font-medium disabled:opacity-50">
            {saving ? "Saving..." : "Save Email settings"}
          </button>
          {saved === "email" && <span className="text-sm text-green-600 ml-3">Saved.</span>}
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-medium text-slate-900 mb-1">Zoho CRM</h3>
        <p className="text-xs text-slate-500 mb-3">
          OAuth credentials for the manual "Run sync now" button on the Zoho CRM tab. See that tab for connection status and sync log.
        </p>
        <form onSubmit={saveZoho} className="space-y-3">
          <ConfigField label="Client ID" value={zohoClientId} onChange={setZohoClientId} overridden={config.overrides.zohoClientId} />
          <SecretField
            label="Client Secret"
            isSet={config.zohoClientSecretSet}
            overridden={config.overrides.zohoClientSecret}
            value={zohoClientSecretInput}
            onChange={setZohoClientSecretInput}
            onClear={() => clearSecret("zohoClientSecret", "Zoho Client Secret")}
          />
          <SecretField
            label="Refresh Token"
            isSet={config.zohoRefreshTokenSet}
            overridden={config.overrides.zohoRefreshToken}
            value={zohoRefreshTokenInput}
            onChange={setZohoRefreshTokenInput}
            onClear={() => clearSecret("zohoRefreshToken", "Zoho Refresh Token")}
          />
          <ConfigField
            label="Accounts Base URL"
            value={zohoAccountsBaseUrl}
            onChange={setZohoAccountsBaseUrl}
            overridden={config.overrides.zohoAccountsBaseUrl}
            placeholder="https://accounts.zoho.com"
          />
          <ConfigField
            label="API Base URL"
            value={zohoApiBaseUrl}
            onChange={setZohoApiBaseUrl}
            overridden={config.overrides.zohoApiBaseUrl}
            placeholder="https://www.zohoapis.com"
          />
          <p className="text-xs text-slate-400">
            Not on the US data center? Both base URLs need to match your Zoho account's region (e.g. zoho.eu, zoho.in, zoho.com.au, zoho.jp).
          </p>
          <button type="submit" disabled={saving} className="bg-slate-900 text-white rounded-lg py-2 px-4 text-sm font-medium disabled:opacity-50">
            {saving ? "Saving..." : "Save Zoho settings"}
          </button>
          {saved === "zoho" && <span className="text-sm text-green-600 ml-3">Saved.</span>}
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:col-span-2">
        <h3 className="font-medium text-slate-900 mb-1">Notification schedules</h3>
        <p className="text-xs text-slate-500 mb-3">Cron expressions. Changes apply immediately — no restart needed.</p>
        <form onSubmit={saveSchedules} className="grid sm:grid-cols-2 gap-3">
          <ConfigField
            label="Due-soon / overdue escalation check"
            value={notificationCronSchedule}
            onChange={setNotificationCronSchedule}
            overridden={config.overrides.notificationCronSchedule}
            placeholder="0 * * * *"
          />
          <ConfigField
            label="Weekly summary email"
            value={weeklyReportCronSchedule}
            onChange={setWeeklyReportCronSchedule}
            overridden={config.overrides.weeklyReportCronSchedule}
            placeholder="0 8 * * 1"
          />
          <button type="submit" disabled={saving} className="sm:col-span-2 bg-slate-900 text-white rounded-lg py-2 px-4 text-sm font-medium w-fit disabled:opacity-50">
            {saving ? "Saving..." : "Save schedules"}
          </button>
          {saved === "schedules" && <span className="text-sm text-green-600 ml-3">Saved.</span>}
        </form>
      </section>
    </div>
  );
}

function ConfigField({
  label,
  value,
  onChange,
  overridden,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  overridden: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-700 mb-1 flex items-center gap-2">
        {label}
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${overridden ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}>
          {overridden ? "custom" : ".env default"}
        </span>
      </span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input" />
    </label>
  );
}

function SecretField({
  label,
  isSet,
  overridden,
  value,
  onChange,
  onClear,
}: {
  label: string;
  isSet: boolean;
  overridden: boolean;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-700 mb-1 flex items-center gap-2">
        {label}
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSet ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400"}`}>
          {isSet ? "configured" : "not set"}
        </span>
        {overridden && (
          <button type="button" onClick={onClear} className="text-[10px] text-red-500 hover:underline ml-auto">
            Clear
          </button>
        )}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isSet ? "Leave blank to keep the current value" : "Not set"}
        className="input"
        autoComplete="new-password"
      />
    </label>
  );
}
