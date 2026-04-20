import { useEffect, useMemo, useState } from "react";
import {
  type OneTimeExpense,
  type PlanInputs,
  projectNetWorth,
  savingsRate,
} from "./model";

const STORAGE_KEY = "financial-planning-plan-v1";

const RUPEES_PER_CRORE = 1e7;

const defaultPlan: PlanInputs = {
  age: 30,
  retirementAge: 60,
  netWorth: 5_00_00_000,
  annualIncome: 80_00_000,
  annualSavings: 40_00_000,
  annualIncomeIncrease: 0.05,
  annualSavingsIncrease: 0.05,
  returnNow: 0.12,
  returnAtRetirement: 0.06,
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
        : (globalThis.crypto?.randomUUID?.() ?? `e-${out.length}`);
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
      typeof p.investmentReturn === "number" &&
      Number.isFinite(p.investmentReturn)
        ? p.investmentReturn
        : undefined;
    const returnNow =
      typeof p.returnNow === "number" && Number.isFinite(p.returnNow)
        ? p.returnNow
        : (legacy ?? defaultPlan.returnNow);
    const returnAtRetirement =
      typeof p.returnAtRetirement === "number" &&
      Number.isFinite(p.returnAtRetirement)
        ? p.returnAtRetirement
        : (legacy ?? defaultPlan.returnAtRetirement);
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
      annualIncomeIncrease:
        typeof p.annualIncomeIncrease === "number" &&
        Number.isFinite(p.annualIncomeIncrease)
          ? p.annualIncomeIncrease
          : defaultPlan.annualIncomeIncrease,
      annualSavingsIncrease:
        typeof p.annualSavingsIncrease === "number" &&
        Number.isFinite(p.annualSavingsIncrease)
          ? p.annualSavingsIncrease
          : defaultPlan.annualSavingsIncrease,
      returnNow,
      returnAtRetirement,
      oneTimeExpenses: normalizeExpenses(
        (p as { oneTimeExpenses?: unknown }).oneTimeExpenses,
      ),
    };
  } catch {
    return defaultPlan;
  }
}

/** 1 crore = ₹1,00,00,000 */
function formatCrores(rupees: number): string {
  if (!Number.isFinite(rupees)) return "—";
  const cr = rupees / RUPEES_PER_CRORE;
  const abs = Math.abs(cr);
  const maxFrac =
    abs === 0 ? 0 : abs < 0.001 ? 6 : abs < 0.01 ? 4 : abs < 1 ? 3 : 2;
  const n = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  }).format(cr);
  return `₹${n} Cr`;
}

/** Table money columns: always one decimal place. */
function formatCroresTable(rupees: number): string {
  if (!Number.isFinite(rupees)) return "—";
  const cr = rupees / RUPEES_PER_CRORE;
  const n = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(cr);
  return `₹${n} Cr`;
}

function rupeesFromCroreField(cr: number): number {
  if (!Number.isFinite(cr) || cr < 0) return 0;
  return cr * RUPEES_PER_CRORE;
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
    typeof window === "undefined" ? defaultPlan : loadPlan(),
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
    patch: Partial<Pick<OneTimeExpense, "age" | "amount">>,
  ) => {
    setPlan((p) => ({
      ...p,
      oneTimeExpenses: p.oneTimeExpenses.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    }));
  };

  const removeOneTimeExpense = (id: string) => {
    setPlan((p) => ({
      ...p,
      oneTimeExpenses: p.oneTimeExpenses.filter((e) => e.id !== id),
    }));
  };

  const resetToDefault = () => {
    setPlan({
      ...defaultPlan,
      oneTimeExpenses: [],
    });
  };

  const startBalance = rows[0]?.startingAssets ?? plan.netWorth;
  const endBalance = end?.endingAssets ?? 0;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <h1>Financial planning</h1>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={resetToDefault}
          >
            Reset to default
          </button>
        </div>
        <p>
          Track net worth by age, income, savings, one-time expenses at chosen
          ages, and expected returns (linear from now to retirement). Net worth,
          income, and yearly savings are entered in ₹ crore; one-time expenses
          stay in rupees. Numbers stay in this browser only.
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
              onChange={(e) => set("age")(parseNum(e.target.value, plan.age))}
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
                  parseNum(e.target.value, plan.retirementAge),
                )
              }
            />
            <div className="field-hint">
              Often retirement age; projection runs from current age through
              this year.
            </div>
          </div>
          <div className="field">
            <label htmlFor="nw">Current net worth (₹ Cr)</label>
            <input
              id="nw"
              type="number"
              min={0}
              step={0.1}
              value={plan.netWorth / RUPEES_PER_CRORE}
              onChange={(e) =>
                set("netWorth")(
                  rupeesFromCroreField(
                    parseNum(e.target.value, plan.netWorth / RUPEES_PER_CRORE),
                  ),
                )
              }
            />
          </div>
        </section>

        <section className="card">
          <h2>Cash flow &amp; returns</h2>
          <div className="field-pair">
            <div className="field">
              <label htmlFor="income">Yearly income (after tax) (₹ Cr)</label>
              <input
                id="income"
                type="number"
                min={0}
                step={0.1}
                value={plan.annualIncome / RUPEES_PER_CRORE}
                onChange={(e) =>
                  set("annualIncome")(
                    rupeesFromCroreField(
                      parseNum(
                        e.target.value,
                        plan.annualIncome / RUPEES_PER_CRORE,
                      ),
                    ),
                  )
                }
              />
            </div>
            <div className="field">
              <label htmlFor="inc-growth">
                Annual income increase (%)
              </label>
              <input
                id="inc-growth"
                type="number"
                min={-50}
                max={50}
                step={0.5}
                value={Math.round(plan.annualIncomeIncrease * 1000) / 10}
                onChange={(e) => {
                  const v = parseNum(
                    e.target.value,
                    plan.annualIncomeIncrease * 100,
                  );
                  set("annualIncomeIncrease")(v / 100);
                }}
              />
            </div>
          </div>
          <div className="field-pair">
            <div className="field">
              <label htmlFor="save">Yearly savings / investments (₹ Cr)</label>
              <input
                id="save"
                type="number"
                min={0}
                step={0.1}
                value={plan.annualSavings / RUPEES_PER_CRORE}
                onChange={(e) =>
                  set("annualSavings")(
                    rupeesFromCroreField(
                      parseNum(
                        e.target.value,
                        plan.annualSavings / RUPEES_PER_CRORE,
                      ),
                    ),
                  )
                }
              />
              <div className="field-hint">
                Amount you add to investments each year (401k, brokerage,
                etc.).
              </div>
            </div>
            <div className="field">
              <label htmlFor="sav-growth">
                Annual savings increase (%)
              </label>
              <input
                id="sav-growth"
                type="number"
                min={-50}
                max={50}
                step={0.5}
                value={Math.round(plan.annualSavingsIncrease * 1000) / 10}
                onChange={(e) => {
                  const v = parseNum(
                    e.target.value,
                    plan.annualSavingsIncrease * 100,
                  );
                  set("annualSavingsIncrease")(v / 100);
                }}
              />
            </div>
          </div>
          <div className="field-pair">
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
                Annual return at retirement age
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
                    plan.returnAtRetirement * 100,
                  );
                  set("returnAtRetirement")(v / 100);
                }}
              />
            </div>
            <div className="field-hint field-pair-footnote">
              Enter each as percent (e.g. 6 for 6%). Linear approximation between now and retirement is assumed.
            </div>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>One-time expenses</h2>
        <div className="expense-toolbar">
          <p>
            Deducted once at the start of the age you pick (wedding, home
            down-payment, etc.). Amounts in rupees; projection table shows when
            they hit.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={addOneTimeExpense}
          >
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
            <div className="label">
              End of plan (age {end?.age ?? plan.retirementAge})
            </div>
            <div className="value accent mono">{formatCrores(endBalance)}</div>
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
                <th title="Interpolated annual return this year">Return</th>
                <th title="After-tax income for this plan year">
                  Income (₹ Cr)
                </th>
                <th title="Balance at start of year, before one-time expenses">
                  Starting (₹ Cr)
                </th>
                <th title="Contributions added at end of year">
                  Savings (₹ Cr)
                </th>
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
              {rows.map((r) => (
                <tr
                  key={r.age}
                  className={r.oneTimeExpense > 0 ? "row-expense" : undefined}
                >
                  <td>{r.age}</td>
                  <td className="mono">{pct.format(r.annualReturnRate)}</td>
                  <td className="mono">{formatCroresTable(r.yearlyIncome)}</td>
                  <td className="mono">
                    {formatCroresTable(r.startingAssets)}
                  </td>
                  <td className="mono">{formatCroresTable(r.yearlySavings)}</td>
                  <td className="mono">
                    {formatCroresTable(r.portfolioGrowth)}
                  </td>
                  <td className="mono">
                    {r.oneTimeExpense > 0
                      ? formatCroresTable(r.oneTimeExpense)
                      : "—"}
                  </td>
                  <td className="mono">{formatCroresTable(r.endingAssets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footer-note">
        Model each year: starting assets → less one-time expenses → balance
        earns that year’s return (linearly interpolated between your “now” and
        “at retirement” rates) → add yearly savings (growing by your savings
        increase) → ending assets (carried forward). Income grows by your income
        increase each year for the table; it does not flow into the balance
        except via savings. Not tax or inflation advice—use real after-inflation
        returns if you like.
      </p>
    </div>
  );
}
