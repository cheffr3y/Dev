// Festival proposal math. Recipe food cost and forecast revenue are supplied
// by the existing festival/banquet engines; this module adds the event costs
// that live outside a recipe and answers the practical pricing questions.

export type FestivalExpenseInputs = {
  laborHours: number;
  laborRate: number;
  boothFee: number;
  equipmentCost: number;
  disposablesCost: number;
  transportCost: number;
  otherCost: number;
  salesFeePct: number; // fraction 0-1
  targetMarginPct: number; // fraction 0-1
};

export type FestivalAccounting = {
  laborCost: number;
  fixedCosts: number;
  salesFees: number;
  totalCost: number;
  projectedProfit: number;
  netMarginPct: number | null;
  breakEvenRevenue: number;
  targetRevenue: number | null;
  revenueGap: number | null;
  priceMultiplier: number | null;
};

export function buildFestivalAccounting(
  revenue: number,
  foodCost: number,
  expenses: FestivalExpenseInputs,
): FestivalAccounting {
  const laborCost = expenses.laborHours * expenses.laborRate;
  const fixedCosts =
    laborCost +
    expenses.boothFee +
    expenses.equipmentCost +
    expenses.disposablesCost +
    expenses.transportCost +
    expenses.otherCost;
  const salesFees = revenue * expenses.salesFeePct;
  const totalCost = foodCost + fixedCosts + salesFees;
  const projectedProfit = revenue - totalCost;
  const netMarginPct = revenue > 0 ? projectedProfit / revenue : null;

  // Revenue also creates sales fees, so solve R - fee*R = base cost.
  const afterFeeRate = 1 - expenses.salesFeePct;
  const baseCost = foodCost + fixedCosts;
  const breakEvenRevenue = afterFeeRate > 0 ? baseCost / afterFeeRate : Infinity;

  // Solve R - fee*R - baseCost = targetMargin*R.
  const targetDenominator = 1 - expenses.salesFeePct - expenses.targetMarginPct;
  const targetRevenue = targetDenominator > 0 ? baseCost / targetDenominator : null;
  const revenueGap = targetRevenue == null ? null : Math.max(0, targetRevenue - revenue);
  const priceMultiplier = targetRevenue != null && revenue > 0 ? targetRevenue / revenue : null;

  return {
    laborCost,
    fixedCosts,
    salesFees,
    totalCost,
    projectedProfit,
    netMarginPct,
    breakEvenRevenue,
    targetRevenue,
    revenueGap,
    priceMultiplier,
  };
}
