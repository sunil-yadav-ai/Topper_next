import { useEffect, useState } from "react";
import Panel from "./Panel.jsx";
import { api } from "../lib/api.js";

function messageFrom(error) {
  return error.response?.data?.message ?? error.message ?? "Reward request failed.";
}

const initialAdjustment = { studentEmail: "", points: "", reason: "" };
const initialBonus = { resourceType: "note", resourceId: "", reason: "" };

export default function AdminRewardsPanel() {
  const [overview, setOverview] = useState(null);
  const [adjustment, setAdjustment] = useState(initialAdjustment);
  const [bonus, setBonus] = useState(initialBonus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  async function loadOverview(page = historyPage) {
    const { data } = await api.get("/rewards/admin/overview", {
      params: { page },
    });
    setOverview(data);
  }

  useEffect(() => {
    loadOverview().catch((requestError) => setError(messageFrom(requestError)));
  }, [historyPage]);

  async function submitAdjustment(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/rewards/admin/adjust", {
        ...adjustment,
        points: Number(adjustment.points),
      });
      setNotice(data.message);
      setAdjustment(initialAdjustment);
      await loadOverview(historyPage);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function submitQualityBonus(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/rewards/admin/quality-bonus", {
        ...bonus,
        resourceId: bonus.resourceId.trim(),
      });
      setNotice(data.message);
      setBonus(initialBonus);
      await loadOverview(historyPage);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy(false);
    }
  }

  function updateAdjustment(event) {
    const { name, value } = event.target;
    setAdjustment((current) => ({ ...current, [name]: value }));
  }

  function updateBonus(event) {
    const { name, value } = event.target;
    setBonus((current) => ({ ...current, [name]: value }));
  }

  return (
    <section className="space-y-5" aria-labelledby="admin-rewards-heading">
      <div>
        <h2 className="text-xl font-bold text-ink" id="admin-rewards-heading">Contributor reward management</h2>
        <p className="mt-1 text-sm text-slate-600">
          All awards are recorded in the ledger and limited by the configured platform point budget.
        </p>
      </div>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
      {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}

      {overview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Initial allocated points", overview.budget.initialPoints],
              ["Available points", overview.budget.availablePoints],
              ["Total distributed", overview.budget.distributedPoints],
              ["Returned after deductions", overview.budget.reclaimedPoints],
            ].map(([label, points]) => (
              <Panel key={label}>
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-extrabold text-ink">{points}</p>
              </Panel>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <h3 className="text-lg font-bold text-ink">Award or adjust points</h3>
              <p className="mt-1 text-sm text-slate-600">Use a positive number to award or a negative number to deduct. Deductions require a reason and return points to the available pool.</p>
              <form className="mt-4 space-y-3" onSubmit={submitAdjustment}>
                <label className="block text-sm font-semibold text-slate-700">
                  Student account email
                  <input
                    autoComplete="email"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-normal"
                    name="studentEmail"
                    onChange={updateAdjustment}
                    required
                    type="email"
                    value={adjustment.studentEmail}
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Points (+ award, − deduction)
                  <input
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-normal"
                    max="1000"
                    min="-1000"
                    name="points"
                    onChange={updateAdjustment}
                    required
                    type="number"
                    value={adjustment.points}
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Audit reason
                  <textarea
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-normal"
                    maxLength={500}
                    name="reason"
                    onChange={updateAdjustment}
                    required
                    rows={3}
                    value={adjustment.reason}
                  />
                </label>
                <button className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60" disabled={busy} type="submit">
                  Record point adjustment
                </button>
              </form>
            </Panel>

            <Panel>
              <h3 className="text-lg font-bold text-ink">Recognize a high-quality resource</h3>
              <p className="mt-1 text-sm text-slate-600">Award the configured quality bonus to the owner of a published resource. Each resource can receive this bonus once.</p>
              <form className="mt-4 space-y-3" onSubmit={submitQualityBonus}>
                <label className="block text-sm font-semibold text-slate-700">
                  Resource type
                  <select
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-normal"
                    name="resourceType"
                    onChange={updateBonus}
                    value={bonus.resourceType}
                  >
                    <option value="note">Published handwritten note</option>
                    <option value="pyq">Published PYQ</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Resource ID
                  <input
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-normal"
                    name="resourceId"
                    onChange={updateBonus}
                    required
                    value={bonus.resourceId}
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Quality review reason
                  <textarea
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-normal"
                    maxLength={500}
                    name="reason"
                    onChange={updateBonus}
                    required
                    rows={3}
                    value={bonus.reason}
                  />
                </label>
                <button className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60" disabled={busy} type="submit">
                  Award quality bonus
                </button>
              </form>
            </Panel>
          </div>

          <Panel>
            <h3 className="text-lg font-bold text-ink">Reward distribution history</h3>
            {overview.transactions.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Student</th>
                      <th className="py-2 pr-3">Action</th>
                      <th className="py-2 pr-3">Recorded by</th>
                      <th className="py-2 pr-3">Points</th>
                      <th className="py-2 pr-3">Budget change</th>
                      <th className="py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overview.transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="py-3 pr-3 text-slate-500">{new Date(transaction.createdAt).toLocaleString()}</td>
                        <td className="py-3 pr-3">
                          <span className="block font-semibold text-slate-800">{transaction.student}</span>
                          <span className="text-xs text-slate-500">{transaction.studentEmail}</span>
                        </td>
                        <td className="py-3 pr-3 capitalize text-slate-700">{transaction.type.replaceAll("_", " ")}</td>
                        <td className="py-3 pr-3 text-slate-600">{transaction.actor}</td>
                        <td className={`py-3 pr-3 font-bold ${transaction.points < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                          {transaction.points > 0 ? "+" : ""}{transaction.points}
                        </td>
                        <td className="py-3 pr-3">{transaction.budgetDelta > 0 ? "+" : ""}{transaction.budgetDelta}</td>
                        <td className="py-3 text-slate-600">{transaction.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No points have been distributed yet.</p>
            )}
          </Panel>
          <Panel>
            <h3 className="text-lg font-bold text-ink">Recent contribution records</h3>
            {overview.contributions.length ? (
              <div className="mt-3 divide-y divide-slate-100">
                {overview.contributions.map((contribution) => (
                  <article className="flex flex-wrap items-center justify-between gap-3 py-3" key={contribution.id}>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{contribution.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {contribution.student} ({contribution.studentEmail}) · {contribution.type.replaceAll("_", " ")} · {contribution.reviewer}
                      </p>
                    </div>
                    <span className="text-sm font-bold capitalize text-slate-700">
                      {contribution.status === "awarded"
                        ? `${contribution.pointsAwarded} points awarded`
                        : "No available budget"}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No approved contributions have been recorded.</p>
            )}
          </Panel>
          {Math.max(
            overview.historyPagination.transactionPages,
            overview.historyPagination.contributionPages,
          ) > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage((page) => page - 1)}
                type="button"
              >
                Newer
              </button>
              <span className="text-sm text-slate-500">
                Page {historyPage} of {Math.max(
                  overview.historyPagination.transactionPages,
                  overview.historyPagination.contributionPages,
                )}
              </span>
              <button
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                disabled={historyPage >= Math.max(
                  overview.historyPagination.transactionPages,
                  overview.historyPagination.contributionPages,
                )}
                onClick={() => setHistoryPage((page) => page + 1)}
                type="button"
              >
                Older
              </button>
            </div>
          )}
        </>
      ) : !error ? (
        <Panel><p className="text-sm text-slate-600">Loading reward budget and distribution history…</p></Panel>
      ) : null}
      <p className="text-xs leading-5 text-slate-500">
        Budget allocation is configured by the platform using REWARD_BUDGET_POINTS. This feature has no cash withdrawal, payment, ad-reward, paid-note, or premium-access functionality.
      </p>
    </section>
  );
}
