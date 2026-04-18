import { useEffect, useMemo, useState } from "react";
import {
  type OneTimeExpense,
  type PlanInputs,
  projectNetWorth,
  savingsRate,
} from "./model";

const STORAGE_KEY = "financial-planning-plan-v1";

const defaultPlan: PlanInputs = {
  age: 32,
  retirementAge: 65,
  netWorth: 125000,
  annualIncome: 95000,
  annualSavings: 18000,
  returnNow: 0.06,
  returnAtRetirement: 0.04,
  oneTimeExpenses: [],
};

function normalizeExpenses(raw: unknown): OneTimeExpense[] {
  if (!Array.isArray(raw)) return [];
  const out: OneTimeExpense[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const age = Number(o.age);
    const amount = Number(o.amount);
    if (!Number.isFinite(age) || !Number.isFinite(amount)) continue;
    const id =
      typeof o.id === "string" && o.id.length > 0
        ? o.id
        : globalThis.crypto?.randomUUID?.() ?? `e-${out.length}`;
    out.push({
      id,
      age: Math.floor(age),
      amount: Math.max(0, amount),
    });
  }
  return out;
}

function loadPlan(): PlanInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPlan;
    const p = JSON.parse(raw) as Partial<PlanInputs> & {
      investmentReturn?: number;
    };
    const legacy =
      typeof p.investmentReturn === "number" && Number.isFinite(p.investmentReturn)
        ? p.investmentReturn
        : undefined;
    const returnNow =
      typeof p.returnNow === "number" && Number.isFinite(p.returnNow)
        ? p.returnNow
        : legacy ?? defaultPlan.returnNow;
    const returnAtRetirement =
      typeof p.returnAtRetirement === "number" &&
      Number.isFinite(p.returnAtRetirement)
        ? p.returnAtRetirement
        : legacy ?? defaultPlan.returnAtRetirement;
    return {
      age: typeof p.age === "number" ? p.age : defaultPlan.age,
      retirementAge:
        typeof p.retirementAge === "number"
          ? p.retirementAge
          : defaultPlan.retirementAge,
      netWorth:
        typeof p.netWorth === "number" ? p.netWorth : defaultPlan.netWorth,
      annualIncome:
        typeof p.annualIncome === "number"
          ? p.annualIncome
          : defaultPlan.annualIncome,
      annualSavings:
        typeof p.annualSavings === "number"
          ? p.annualSavings
          : defaultPlan.annualSavings,
      returnNow,
      returnAtRetirement,
      oneTimeExpenses: normalizeExpenses(
        (p as { oneTimeExpenses?: unknown }).oneTimeExpenses
      ),
    };
  } catch {
    return defaultPlan;
  }
}

/** 1 crore = ₹1,00,00,000 */
function formatCrores(rupees: number): string {
  if (!Number.isFinite(rupees)) return "—";
  const cr = rupees / 1e7;
  const abs = Math.abs(cr);
  const maxFrac =
    abs === 0 ? 0 : abs < 0.001 ? 6 : abs < 0.01 ? 4 : abs < 1 ? 3 : 2;
  const n = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  }).format(cr);
  return `₹${n} Cr`;
}

const pct = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});

function NetWorthChart({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 640;
  const h = 180;
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  });
  const d = `M ${pts.join(" L ")}`;
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Projected net worth over time"
    >
      <defs>
        <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3dd6c3" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#3dd6c3" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${d} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`}
        fill="url(#fill)"
      />
      <path
        d={d}
        fill="none"
        stroke="#3dd6c3"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function parseNum(s: string, fallback: number): number {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export default function App() {
  const [plan, setPlan] = useState<PlanInputs>(() =>
    typeof window === "undefined" ? defaultPlan : loadPlan()
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  }, [plan]);

  const rows = useMemo(() => projectNetWorth(plan), [plan]);
  const nwSeries = useMemo(() => rows.map((r) => r.endingAssets), [rows]);
  const end = rows[rows.length - 1];
  const sr = savingsRate(plan.annualIncome, plan.annualSavings);

  const set =
    <K extends keyof PlanInputs>(key: K) =>
    (value: PlanInputs[K]) =>
      setPlan((p) => ({ ...p, [key]: value }));

  const addOneTimeExpense = () => {
    setPlan((p) => ({
      ...p,
      oneTimeExpenses: [
        ...p.oneTimeExpenses,
        {
          id: crypto.randomUUID(),
          age: Math.min(p.retirementAge, p.age + 5),
          amount: 0,
        },
      ],
    }));
  };

  const updateOneTimeExpense = (
    id: string,
    patch: Partial<Pick<OneTimeExpense, "age" | "amount">>
  ) => {
    setPlan((p) => ({
      ...p,
      oneTimeExpenses: p.oneTimeExpenses.map((e) =>
        e.id === id ? { ...e, ...patch } : e
      ),
    }));
  };

  const removeOneTimeExpense = (id: string) => {
    setPlan((p) => ({
      ...p,
      oneTimeExpenses: p.oneTimeExpenses.filter((e) => e.id !== id),
    }));
  };

  const startBalance = rows[0]?.startingAssets ?? plan.netWorth;
  const endBalance = end?.endingAssets ?? 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Financial planning</h1>
        <p>
          Track net worth by age, income, savings, one-time expenses at chosen
          ages, and expected returns (linear from now to retirement). Summary and
          projections are in ₹
          crore; enter money fields in rupees. Numbers stay in this browser only.
        </p>
      </header>

      <div className="grid grid-2">
        <section className="card">
          <h2>Your profile</h2>
          <div className="field">
            <label htmlFor="age">Current age</label>
            <input
              id="age"
              type="number"
              min={18}
              max={100}
              step={1}
              value={plan.age}
              onChange={(e) =>
                set("age")(parseNum(e.target.value, plan.age))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="retire">Target age (projection end)</label>
            <input
              id="retire"
              type="number"
              min={plan.age}
              max={100}
              step={1}
              value={plan.retirementAge}
              onChange={(e) =>
                set("retirementAge")(
                  parseNum(e.target.value, plan.retirementAge)
                )
              }
            />
            <div className="field-hint">
              Often retirement age; projection runs from current age through
              this year.
            </div>
          </div>
          <div className="field">
            <label htmlFor="nw">Current net worth</label>
            <input
              id="nw"
              type="number"
              min={0}
              step={1000}
              value={plan.netWorth}
              onChange={(e) =>
                set("netWorth")(parseNum(e.target.value, plan.netWorth))
              }
            />
          </div>
        </section>

        <section className="card">
          <h2>Cash flow &amp; returns</h2>
          <div className="field">
            <label htmlFor="income">Yearly income (after tax)</label>
            <input
              id="income"
              type="number"
              min={0}
              step={1000}
              value={plan.annualIncome}
              onChange={(e) =>
                set("annualIncome")(
                  parseNum(e.target.value, plan.annualIncome)
                )
              }
            />
          </div>
          <div className="field">
            <label htmlFor="save">Yearly savings / investments</label>
            <input
              id="save"
              type="number"
              min={0}
              step={500}
              value={plan.annualSavings}
              onChange={(e) =>
                set("annualSavings")(
                  parseNum(e.target.value, plan.annualSavings)
                )
              }
            />
            <div className="field-hint">
              Amount you add to investments each year (401k, brokerage, etc.).
            </div>
          </div>
          <div className="field">
            <label htmlFor="ret-now">Annual return now (at current age)</label>
            <input
              id="ret-now"
              type="number"
              min={-20}
              max={30}
              step={0.5}
              value={Math.round(plan.returnNow * 1000) / 10}
              onChange={(e) => {
                const v = parseNum(e.target.value, plan.returnNow * 100);
                set("returnNow")(v / 100);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="ret-retire">
              Annual return at retirement (target age)
            </label>
            <input
              id="ret-retire"
              type="number"
              min={-20}
              max={30}
              step={0.5}
              value={Math.round(plan.returnAtRetirement * 1000) / 10}
              onChange={(e) => {
                const v = parseNum(
                  e.target.value,
                  plan.returnAtRetirement * 100
                );
                set("returnAtRetirement")(v / 100);
              }}
            />
            <div className="field-hint">
              Enter each as percent (e.g. 6 for 6%). The model uses a straight
              line between “now” and “at retirement” by year.
            </div>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>One-time expenses</h2>
        <div className="expense-toolbar">
          <p>
            Deducted once at the start of the age you pick (wedding, home
            down-payment, etc.). Amounts in rupees; projection table shows
            when they hit.
          </p>
          <button type="button" className="btn btn-primary" onClick={addOneTimeExpense}>
            Add expense
          </button>
        </div>
        {plan.oneTimeExpenses.length === 0 ? (
          <p className="expense-empty">No one-time expenses yet.</p>
        ) : (
          <div className="expense-list">
            {plan.oneTimeExpenses.map((e) => (
              <div key={e.id} className="expense-row">
                <div className="field">
                  <label htmlFor={`ex-age-${e.id}`}>Age</label>
                  <input
                    id={`ex-age-${e.id}`}
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    value={e.age}
                    onChange={(ev) =>
                      updateOneTimeExpense(e.id, {
                        age: parseNum(ev.target.value, e.age),
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`ex-amt-${e.id}`}>Amount (₹)</label>
                  <input
                    id={`ex-amt-${e.id}`}
                    type="number"
                    min={0}
                    step={10000}
                    value={e.amount}
                    onChange={(ev) =>
                      updateOneTimeExpense(e.id, {
                        amount: parseNum(ev.target.value, e.amount),
                      })
                    }
                  />
                </div>
                <div className="field-remove">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => removeOneTimeExpense(e.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Year-by-year breakdown</h2>
        <div className="stats">
          <div className="stat">
            <div className="label">Start (age {plan.age})</div>
            <div className="value accent mono">
              {formatCrores(startBalance)}
            </div>
          </div>
          <div className="stat">
            <div className="label">End of plan (age {end?.age ?? plan.retirementAge})</div>
            <div className="value accent mono">
              {formatCrores(endBalance)}
            </div>
          </div>
          <div className="stat">
            <div className="label">Savings rate</div>
            <div className="value mono">
              {sr === null ? "—" : pct.format(sr / 100)}
            </div>
          </div>
          <div className="stat">
            <div className="label">Return path (linear)</div>
            <div className="value mono" style={{ fontSize: "0.95rem" }}>
              {pct.format(plan.returnNow)} →{" "}
              {pct.format(plan.returnAtRetirement)}
            </div>
          </div>
        </div>

        <div className="chart-wrap">
          <NetWorthChart values={nwSeries} />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Age</th>
                <th>Year</th>
                <th title="Interpolated annual return this year">Return</th>
                <th title="Balance at start of year, before one-time expenses">
                  Starting (₹ Cr)
                </th>
                <th title="Contributions added at end of year">Savings (₹ Cr)</th>
                <th title="Return on balance after one-time expenses (rate × balance)">
                  Growth (₹ Cr)
                </th>
                <th title="One-time expenses deducted at start of year">
                  One-time (₹ Cr)
                </th>
                <th title="Balance after growth and savings">Ending (₹ Cr)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.age}
                  className={r.oneTimeExpense > 0 ? "row-expense" : undefined}
                >
                  <td>{r.age}</td>
                  <td className="mono">+{i}</td>
                  <td className="mono">{pct.format(r.annualReturnRate)}</td>
                  <td className="mono">{formatCrores(r.startingAssets)}</td>
                  <td className="mono">{formatCrores(r.yearlySavings)}</td>
                  <td className="mono">{formatCrores(r.portfolioGrowth)}</td>
                  <td className="mono">
                    {r.oneTimeExpense > 0 ? formatCrores(r.oneTimeExpense) : "—"}
                  </td>
                  <td className="mono">{formatCrores(r.endingAssets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footer-note">
        Model each year: starting assets → less one-time expenses → balance
        earns that year’s return (linearly interpolated between your “now” and
        “at retirement” rates) → add yearly savings → ending assets (carried
        forward). Not tax or inflation advice—use real after-inflation returns
        if you like.
      </p>
    </div>
  );
}
