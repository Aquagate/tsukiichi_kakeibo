import dayjs from "dayjs";

export function summarizeMonthly(transactions) {
  const map = new Map();
  for (const tx of transactions) {
    if (!tx.date) continue;
    const month = dayjs(tx.date).format("YYYY-MM");
    const entry = map.get(month) ?? { income: 0, expense: 0, transfer: 0 };
    if (tx.isTransfer) {
      entry.transfer += Math.abs(tx.amount);
    } else if (tx.amount >= 0) {
      entry.income += tx.amount;
    } else {
      entry.expense += Math.abs(tx.amount);
    }
    map.set(month, entry);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] > b[0] ? -1 : 1))
    .map(([month, entry]) => ({
      month,
      income: entry.income,
      expense: entry.expense,
      net: entry.income - entry.expense,
      transfer: entry.transfer,
    }));
}

export function currentMonthSummary(transactions) {
  const month = dayjs().format("YYYY-MM");
  const monthly = transactions.filter((tx) => dayjs(tx.date).format("YYYY-MM") === month);
  let income = 0;
  let expense = 0;
  let transfer = 0;
  for (const tx of monthly) {
    if (tx.isTransfer || !tx.isIncluded) {
      if (tx.isTransfer) transfer += Math.abs(tx.amount);
      continue;
    }
    if (tx.amount >= 0) income += tx.amount;
    else expense += Math.abs(tx.amount);
  }
  return { income, expense, net: income - expense, transfer };
}

export function topCategories(transactions, limit = 5) {
  const month = dayjs().format("YYYY-MM");
  const map = new Map();
  for (const tx of transactions) {
    if (tx.isTransfer || !tx.isIncluded) continue;
    if (dayjs(tx.date).format("YYYY-MM") !== month) continue;
    if (tx.amount >= 0) continue;
    const key = tx.majorCategory || "未分類";
    const total = map.get(key) ?? 0;
    map.set(key, total + Math.abs(tx.amount));
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, amount]) => ({ category, amount }));
}

export function detectAlerts(transactions) {
  const alerts = [];
  const months = summarizeMonthly(
    transactions.filter((tx) => !tx.isTransfer && tx.isIncluded)
  );
  if (months.length >= 2) {
    const [current, ...rest] = months;
    const avgExpense = rest.reduce((sum, m) => sum + m.expense, 0) / rest.length;
    if (avgExpense > 0 && current.expense > avgExpense * 1.3) {
      alerts.push(
        `今月の支出が平均より ${Math.round((current.expense / avgExpense) * 100) - 100}% 以上増加しています。`
      );
    }
  }
  if (!alerts.length) {
    alerts.push("現時点で重大なアラートはありません。");
  }
  return alerts;
}

export function latestAssetSnapshot(assets) {
  if (!assets.length) return null;
  return assets
    .slice()
    .sort((a, b) => (a.date > b.date ? -1 : 1))[0];
}
