import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email });
    } finally {
      // Always show success regardless of outcome — the backend behaves the
      // same whether or not the email is registered, so this can't be used
      // to find out which emails have accounts.
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Forgot password</h1>
        <p className="text-sm text-slate-500 mb-6">Enter your email and we'll send you a reset link.</p>

        {submitted ? (
          <>
            <p className="text-sm text-slate-700 mb-6">
              If that email is registered, a password reset link has been sent. Check your inbox.
            </p>
            <Link to="/login" className="text-sm font-medium text-slate-900 hover:underline">
              ← Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full mb-6 rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-slate-900 text-white rounded-lg py-2.5 text-base font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>
            <Link to="/login" className="block text-center text-sm text-slate-500 hover:underline mt-4">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
