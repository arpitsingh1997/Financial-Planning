import { useEffect, useMemo, useState } from "react";
import {
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
  investmentReturn: 0.06,
};

function loadPlan(): PlanInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPlan;
    const p = JSON.parse(raw) as Partial<PlanInputs>;
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
      investmentReturn:
        typeof p.investmentReturn === "number"
          ? p.investmentReturn
          : defaultPlan.investmentReturn,
    };
  } catch {
    return defaultPlan;
  }
}

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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
  const nwSeries = useMemo(() => rows.map((r) => r.netWorth), [rows]);
  const end = rows[rows.length - 1];
  const sr = savingsRate(plan.annualIncome, plan.annualSavings);

  const set =
    <K extends keyof PlanInputs>(key: K) =>
    (value: PlanInputs[K]) =>
      setPlan((p) => ({ ...p, [key]: value }));

  return (
    <div className="app">
      <header className="app-header">
        <h1>Financial planning</h1>
        <p>
          Track net worth by age, income, savings, and expected investment
          return. Numbers stay in this browser only.
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
            <label htmlFor="ret">Expected yearly investment return</label>
            <input
              id="ret"
              type="number"
              min={-20}
              max={30}
              step={0.5}
              value={Math.round(plan.investmentReturn * 1000) / 10}
              onChange={(e) => {
                const v = parseNum(e.target.value, plan.investmentReturn * 100);
                set("investmentReturn")(v / 100);
              }}
            />
            <div className="field-hint">Enter as percent (e.g. 6 for 6%).</div>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Net worth snapshot</h2>
        <div className="stats">
          <div className="stat">
            <div className="label">Today (age {plan.age})</div>
            <div className="value accent mono">
              {currency.format(plan.netWorth)}
            </div>
          </div>
          <div className="stat">
            <div className="label">At age {end?.age ?? plan.retirementAge}</div>
            <div className="value accent mono">
              {currency.format(end?.netWorth ?? 0)}
            </div>
          </div>
          <div className="stat">
            <div className="label">Savings rate</div>
            <div className="value mono">
              {sr === null ? "—" : pct.format(sr / 100)}
            </div>
          </div>
          <div className="stat">
            <div className="label">Return assumption</div>
            <div className="value mono">
              {pct.format(plan.investmentReturn)}
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
                <th>Projected net worth</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.age}>
                  <td>{r.age}</td>
                  <td className="mono">+{i}</td>
                  <td className="mono">{currency.format(r.netWorth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footer-note">
        Model: each year, balance compounds at your return rate, then your
        annual savings are added. Not tax or inflation advice—adjust return to
        approximate real after-inflation returns if you like.
      </p>
    </div>
  );
}
