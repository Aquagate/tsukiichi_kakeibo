import "./style.css";
import dayjs from "dayjs";
import {
  initDb,
  upsertAssets,
  upsertTransactions,
  getAllAssets,
  getAllTransactions,
} from "./db";
import { readWorkbook, parseTransactions, parseAssets, sheetToJson } from "./importers";
import {
  currentMonthSummary,
  topCategories,
  detectAlerts,
  latestAssetSnapshot,
  summarizeMonthly,
} from "./aggregations";

const dbStatus = document.getElementById("db-status");
const importResult = document.getElementById("import-result");
const ledgerBody = document.getElementById("ledger-body");
const monthlyBody = document.getElementById("monthly-body");
const monthlySummary = document.getElementById("monthly-summary");
const topCategoriesEl = document.getElementById("top-categories");
const assetSnapshotEl = document.getElementById("asset-snapshot");
const alertsEl = document.getElementById("alerts");

const filters = {
  start: document.getElementById("filter-start"),
  end: document.getElementById("filter-end"),
  search: document.getElementById("filter-search"),
  transfer: document.getElementById("filter-transfer"),
  excluded: document.getElementById("filter-excluded"),
};

let db;
let transactions = [];
let assets = [];

function formatCurrency(value) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(value);
}

function renderDashboard() {
  const summary = currentMonthSummary(transactions);
  monthlySummary.innerHTML = `
    <div>収入: ${formatCurrency(summary.income)}</div>
    <div>支出: ${formatCurrency(summary.expense)}</div>
    <div>収支: ${formatCurrency(summary.net)}</div>
    <div>振替: ${formatCurrency(summary.transfer)}</div>
  `;

  const categories = topCategories(transactions);
  topCategoriesEl.innerHTML = categories
    .map((item) => `<li>${item.category}: ${formatCurrency(item.amount)}</li>`)
    .join("");

  const snapshot = latestAssetSnapshot(assets);
  if (snapshot) {
    assetSnapshotEl.innerHTML = `
      <div>日付: ${snapshot.date}</div>
      <div>合計: ${formatCurrency(snapshot.total)}</div>
      <div>現金: ${formatCurrency(snapshot.cash)}</div>
      <div>株式: ${formatCurrency(snapshot.stocks)}</div>
      <div>投信: ${formatCurrency(snapshot.funds)}</div>
      <div>ポイント: ${formatCurrency(snapshot.points)}</div>
    `;
  } else {
    assetSnapshotEl.textContent = "資産データが未登録です。";
  }

  alertsEl.innerHTML = detectAlerts(transactions)
    .map((alert) => `<li>${alert}</li>`)
    .join("");
}

function renderLedger() {
  const start = filters.start.value ? dayjs(filters.start.value) : null;
  const end = filters.end.value ? dayjs(filters.end.value) : null;
  const keyword = filters.search.value.trim();
  const includeTransfer = filters.transfer.checked;
  const includeExcluded = filters.excluded.checked;

  const filtered = transactions.filter((tx) => {
    if (!includeTransfer && tx.isTransfer) return false;
    if (!includeExcluded && !tx.isIncluded) return false;
    if (start && dayjs(tx.date).isBefore(start, "day")) return false;
    if (end && dayjs(tx.date).isAfter(end, "day")) return false;
    if (keyword) {
      const haystack = `${tx.description} ${tx.memo} ${tx.majorCategory} ${tx.minorCategory}`;
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });

  ledgerBody.innerHTML = filtered
    .slice()
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .map(
      (tx) => `
      <tr>
        <td>${tx.date}</td>
        <td>${tx.description}</td>
        <td>${formatCurrency(tx.amount)}</td>
        <td>${tx.institution}</td>
        <td>${tx.majorCategory}</td>
        <td>${tx.minorCategory}</td>
        <td>${tx.memo ?? ""}</td>
        <td>${tx.isTransfer ? "はい" : ""}</td>
        <td>${tx.isIncluded ? "はい" : ""}</td>
      </tr>
    `
    )
    .join("");
}

function renderMonthlySummary() {
  const monthly = summarizeMonthly(transactions);
  monthlyBody.innerHTML = monthly
    .map(
      (entry) => `
      <tr>
        <td>${entry.month}</td>
        <td>${formatCurrency(entry.income)}</td>
        <td>${formatCurrency(entry.expense)}</td>
        <td>${formatCurrency(entry.net)}</td>
        <td>${formatCurrency(entry.transfer)}</td>
      </tr>
    `
    )
    .join("");
}

async function loadData() {
  transactions = await getAllTransactions(db);
  assets = await getAllAssets(db);
  renderDashboard();
  renderLedger();
  renderMonthlySummary();
}

async function handleImport(file, type) {
  if (!file) return;
  const workbook = await readWorkbook(file);
  if (type === "transactions") {
    const rows = sheetToJson(workbook, "マスタ");
    const records = parseTransactions(rows, file.name);
    await upsertTransactions(db, records);
    importResult.textContent = `明細を ${records.length} 件取り込みました。`;
  } else {
    const rows = sheetToJson(workbook, "資産推移");
    const records = parseAssets(rows);
    await upsertAssets(db, records);
    importResult.textContent = `資産推移を ${records.length} 件取り込みました。`;
  }
  await loadData();
}

async function setup() {
  db = await initDb();
  dbStatus.textContent = "DB: 初期化済み";
  await loadData();

  document.getElementById("import-transactions").addEventListener("click", async () => {
    const file = document.getElementById("transactions-file").files[0];
    await handleImport(file, "transactions");
  });

  document.getElementById("import-assets").addEventListener("click", async () => {
    const file = document.getElementById("assets-file").files[0];
    await handleImport(file, "assets");
  });

  document.getElementById("refresh-ledger").addEventListener("click", () => {
    renderLedger();
  });
}

setup();
