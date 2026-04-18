export type PlanInputs = {
  age: number;
  retirementAge: number;
  netWorth: number;
  annualIncome: number;
  annualSavings: number;
  /** Expected annual real return, e.g. 0.07 for 7% */
  investmentReturn: number;
};

export type YearProjection = {
  age: number;
  yearIndex: number;
  netWorth: number;
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/** End-of-year: grow balance, then add savings. */
export function projectNetWorth(inputs: PlanInputs): YearProjection[] {
  const age = Math.floor(clamp(inputs.age, 0, 120));
  const retire = Math.floor(clamp(inputs.retirementAge, age, 120));
  const r = clamp(inputs.investmentReturn, -0.5, 0.5);
  const savings = Math.max(0, inputs.annualSavings);
  let nw = Math.max(0, inputs.netWorth);

  const rows: YearProjection[] = [];
  for (let a = age; a <= retire; a++) {
    rows.push({ age: a, yearIndex: a - age, netWorth: nw });
    if (a === retire) break;
    nw = nw * (1 + r) + savings;
  }
  return rows;
}

export function savingsRate(income: number, savings: number): number | null {
  if (income <= 0) return null;
  return (savings / income) * 100;
}
