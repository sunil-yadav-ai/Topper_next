import { useEffect, useState } from "react";
import Panel from "./Panel.jsx";
import { api } from "../lib/api.js";

function messageFrom(error) {
  return error.response?.data?.message ?? error.message ?? "Could not load rewards.";
}

function readableType(value) {
  return value.replaceAll("_", " ");
}

export default function RewardCenter() {
  const [rewards, setRewards] = useState(null);
  const [error, setError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    api.get("/rewards/me", { params: { page: historyPage } })
      .then(({ data }) => setRewards(data))
      .catch((requestError) => setError(messageFrom(requestError)));
  }, [historyPage]);

  return (
    <section className="space-y-5" aria-labelledby="rewards-heading">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Your impact</p>
        <h2 className="mt-1 text-xl font-bold text-ink" id="rewards-heading">Contributor rewards</h2>
        <p className="mt-1 text-sm text-slate-600">
          Points recognize verified academic contributions. They never unlock resources or represent cash.
        </p>
      </div>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
      {!rewards && !error ? (
        <Panel><p className="text-sm text-slate-600">Loading your reward history…</p></Panel>
      ) : rewards ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/70">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Earned reward points</p>
              <p className="mt-2 text-3xl font-extrabold text-brand">{rewards.account.points}</p>
            </Panel>
            <Panel>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Leaderboard rank</p>
              <p className="mt-2 text-3xl font-extrabold text-ink">
                {rewards.account.rank ? `#${rewards.account.rank}` : "—"}
              </p>
            </Panel>
            <Panel>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Platform points remaining</p>
              <p className="mt-2 text-3xl font-extrabold text-ink">{rewards.budget.availablePoints}</p>
              <p className="mt-1 text-xs text-slate-500">Fixed, finite reward allocation</p>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <h3 className="text-lg font-bold text-ink">How points are awarded</h3>
              <ul className="mt-3 space-y-3">
                {rewards.rules.map((rule) => (
                  <li className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0" key={rule.type}>
                    <span className="text-sm capitalize text-slate-700">{rule.title}</span>
                    <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-brand">
                      {rule.points} points
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Notes earn points only after AI verification. PYQs earn points when uploaded and published. Correction reports earn points only after an administrator confirms an academic issue; high-quality bonuses require administrator review.
              </p>
            </Panel>
            <Panel>
              <h3 className="text-lg font-bold text-ink">Contributor leaderboard</h3>
              {rewards.leaderboard.length ? (
                <ol className="mt-3 divide-y divide-slate-100">
                  {rewards.leaderboard.slice(0, 10).map((entry) => (
                    <li className={`flex items-center justify-between gap-3 py-2.5 ${entry.isCurrentUser ? "rounded-lg bg-indigo-50 px-2" : ""}`} key={`${entry.rank}-${entry.student}`}>
                      <span className="min-w-0 text-sm text-slate-700">
                        <span className="mr-2 font-bold text-brand">#{entry.rank}</span>
                        <span className="font-semibold">{entry.student}</span>
                        {entry.college && <span className="block truncate pl-8 text-xs text-slate-500">{entry.college}</span>}
                      </span>
                      <span className="shrink-0 text-sm font-bold text-ink">{entry.points} pts</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No contributors have earned points yet.</p>
              )}
            </Panel>
          </div>

          <Panel>
            <h3 className="text-lg font-bold text-ink">Recognized contributions</h3>
            {rewards.contributions.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {rewards.contributions.map((contribution) => (
                  <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={contribution.id}>
                    <span>
                      <span className="block text-sm font-semibold capitalize text-slate-800">{contribution.title}</span>
                      <span className="text-xs capitalize text-slate-500">{contribution.type.replaceAll("_", " ")} · {new Date(contribution.createdAt).toLocaleDateString()}</span>
                    </span>
                    <span className="text-sm font-bold text-ink">
                      {contribution.status === "awarded"
                        ? `+${contribution.pointsAwarded} points`
                        : "Recognized; no budget available"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Recognized contributions will appear here.</p>
            )}
          </Panel>

          <Panel>
            <h3 className="text-lg font-bold text-ink">Your point history</h3>
            {rewards.transactions.length ? (
              <div className="mt-3 divide-y divide-slate-100">
                {rewards.transactions.map((transaction) => (
                  <article className="flex flex-wrap items-center justify-between gap-2 py-3" key={transaction.id}>
                    <div>
                      <p className="text-sm font-semibold capitalize text-slate-800">
                        {readableType(transaction.type)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{transaction.reason}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {new Date(transaction.createdAt).toLocaleString()} · Balance after: {transaction.balanceAfter}
                      </p>
                    </div>
                    <span className={`font-bold ${transaction.points < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {transaction.points > 0 ? "+" : ""}{transaction.points}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Verified contributions and administrator adjustments will appear here.</p>
            )}
          </Panel>
          {Math.max(
            rewards.historyPagination.transactionPages,
            rewards.historyPagination.contributionPages,
          ) > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage((page) => page - 1)}
                type="button"
              >
                Newer history
              </button>
              <span className="text-sm text-slate-500">
                Page {historyPage} of {Math.max(
                  rewards.historyPagination.transactionPages,
                  rewards.historyPagination.contributionPages,
                )}
              </span>
              <button
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                disabled={historyPage >= Math.max(
                  rewards.historyPagination.transactionPages,
                  rewards.historyPagination.contributionPages,
                )}
                onClick={() => setHistoryPage((page) => page + 1)}
                type="button"
              >
                Older history
              </button>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
