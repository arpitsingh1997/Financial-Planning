export type OneTimeExpense = {
  id: string;
  age: number;
  /** Positive rupee outflow (deducted at the start of that age in the model). */
  amount: number;
};

export type PlanInputs = {
  age: number;
  retirementAge: number;
  netWorth: number;
  annualIncome: number;
  annualSavings: number;
  /** Year-over-year income growth (decimal, e.g. 0.05 for 5%). */
  annualIncomeIncrease: number;
  /** Year-over-year savings contribution growth (decimal). */
  annualSavingsIncrease: number;
  /** Expected annual return at current age (decimal, e.g. 0.06 for 6%). */
  returnNow: number;
  /** Expected annual return at retirement age; linearly interpolated in between. */
  returnAtRetirement: number;
  oneTimeExpenses: OneTimeExpense[];
};

export type YearProjection = {
  age: number;
  yearIndex: number;
  /** After-tax income for this plan year (grows by annualIncomeIncrease). */
  yearlyIncome: number;
  /** Balance at start of this age year, before one-time expenses. */
  startingAssets: number;
  yearlySavings: number;
  /** Return on balance after one-time expenses: (starting − one-time) × r */
  portfolioGrowth: number;
  /** One-time outflows at this age (0 if none). */
  oneTimeExpense: number;
  /** Balance after return and savings (end of this age year). */
  endingAssets: number;
  /** Annual return used for this year (linear between now and retirement). */
  annualReturnRate: number;
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function expenseTotalAtAge(
  expenses: OneTimeExpense[] | undefined,
  a: number
): number {
  if (!expenses?.length) return 0;
  let sum = 0;
  for (const e of expenses) {
    if (Math.floor(e.age) === a) sum += Math.max(0, e.amount);
  }
  return sum;
}

function returnForYear(
  yearIndex: number,
  spanYears: number,
  rNow: number,
  rRet: number
): number {
  if (spanYears <= 0) return rNow;
  const t = yearIndex / spanYears;
  return rNow + (rRet - rNow) * t;
}

/**
 * Each age year: start with prior ending balance, subtract one-times, apply
 * that year’s return (linear from returnNow to returnAtRetirement), add savings.
 * Income and savings amounts grow by annualIncomeIncrease / annualSavingsIncrease
 * each year (first year uses entered amounts).
 */
export function projectNetWorth(inputs: PlanInputs): YearProjection[] {
  const age = Math.floor(clamp(inputs.age, 0, 120));
  const retire = Math.floor(clamp(inputs.retirementAge, age, 120));
  const rNow = clamp(inputs.returnNow, -0.5, 0.5);
  const rRet = clamp(inputs.returnAtRetirement, -0.5, 0.5);
  const spanYears = retire - age;
  const gInc = clamp(inputs.annualIncomeIncrease, -0.5, 0.5);
  const gSav = clamp(inputs.annualSavingsIncrease, -0.5, 0.5);
  const baseIncome = Math.max(0, inputs.annualIncome);
  const baseSavings = Math.max(0, inputs.annualSavings);
  let nw = Math.max(0, inputs.netWorth);

  const rows: YearProjection[] = [];
  for (let a = age; a <= retire; a++) {
    const yearIndex = a - age;
    const r = clamp(returnForYear(yearIndex, spanYears, rNow, rRet), -0.5, 0.5);
    const yearlyIncome = baseIncome * Math.pow(1 + gInc, yearIndex);
    const yearlySavings = baseSavings * Math.pow(1 + gSav, yearIndex);
    const startingAssets = nw;
    const oneTimeExpense = expenseTotalAtAge(inputs.oneTimeExpenses, a);
    const afterOneTime = Math.max(0, startingAssets - oneTimeExpense);
    const portfolioGrowth = afterOneTime * r;
    const endingAssets = afterOneTime + portfolioGrowth + yearlySavings;

    rows.push({
      age: a,
      yearIndex,
      yearlyIncome,
      startingAssets,
      yearlySavings,
      portfolioGrowth,
      oneTimeExpense,
      endingAssets,
      annualReturnRate: r,
    });
    if (a === retire) break;
    nw = endingAssets;
  }
  return rows;
}

export function savingsRate(income: number, savings: number): number | null {
  if (income <= 0) return null;
  return (savings / income) * 100;
}
