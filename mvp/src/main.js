(() => {
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

  const DB_NAME = "tsukiichi_kakeibo_mvp";
  const DB_VERSION = 1;
  let db;
  let transactions = [];
  let assets = [];

  const TRANSACTION_HEADERS = {
    日付: "date",
    内容: "description",
    "金額（円)": "amount",
    "金額（円）": "amount",
    保有金融機関: "institution",
    大項目: "majorCategory",
    中項目: "minorCategory",
    メモ: "memo",
    "振替(0/1)": "isTransfer",
    ID: "id",
    "計算対象(0/1)": "isIncluded",
    "Source.Name": "sourceFile",
  };

  const ASSET_HEADERS = {
    日付: "date",
    "合計（円）": "total",
    "合計(円)": "total",
    "預金・現金・暗号資産（円）": "cash",
    "預金・現金・暗号資産(円)": "cash",
    "株式(現物)（円）": "stocks",
    "株式(現物)(円)": "stocks",
    "投資信託（円）": "funds",
    "投資信託(円)": "funds",
    "ポイント（円）": "points",
    "ポイント(円)": "points",
  };

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const upgradeDb = request.result;
        if (!upgradeDb.objectStoreNames.contains("transactions")) {
          const store = upgradeDb.createObjectStore("transactions", { keyPath: "id" });
          store.createIndex("by-date", "date");
        }
        if (!upgradeDb.objectStoreNames.contains("assets")) {
          const store = upgradeDb.createObjectStore("assets", { keyPath: "date" });
          store.createIndex("by-date", "date");
        }
      };
    });
  }

  function readAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? []);
    });
  }

  function upsertAll(storeName, records) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const record of records) {
        store.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function normalizeHeader(header) {
    if (!header) return "";
    return header.replace(/^\uFEFF/, "").trim();
  }

  function mapRow(row, headerMap) {
    const mapped = {};
    for (const [key, value] of Object.entries(row)) {
      const normalized = normalizeHeader(key);
      const mappedKey = headerMap[normalized];
      if (mappedKey) {
        mapped[mappedKey] = value;
      }
    }
    return mapped;
  }

  function toNumber(value) {
    if (value === undefined || value === null || value === "") {
      return 0;
    }
    if (typeof value === "number") {
      return value;
    }
    const normalized = String(value).replace(/[,\s]/g, "");
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function toDateString(value) {
    if (!value) return "";
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === "number" && window.XLSX?.SSF?.parse_date_code) {
      const date = window.XLSX.SSF.parse_date_code(value);
      if (!date) return "";
      return new Date(date.y, date.m - 1, date.d).toISOString().slice(0, 10);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return parsed.toISOString().slice(0, 10);
  }

  function hashKey(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 33) ^ value.charCodeAt(i);
    }
    return `H${(hash >>> 0).toString(16)}`;
  }

  function parseTransactions(sheetRows, sourceFileName = "") {
    return sheetRows
      .map((row) => mapRow(row, TRANSACTION_HEADERS))
      .filter((row) => row.date || row.description || row.amount)
      .map((row) => {
        const date = toDateString(row.date);
        const amount = toNumber(row.amount);
        const description = String(row.description ?? "");
        const institution = String(row.institution ?? "");
        const idBase = row.id ? String(row.id) : "";
        const fallbackKey = `${date}|${amount}|${description}|${institution}`;
        const id = idBase || hashKey(fallbackKey);
        return {
          id,
          date,
          amount,
          description,
          institution,
          majorCategory: String(row.majorCategory ?? ""),
          minorCategory: String(row.minorCategory ?? ""),
          memo: String(row.memo ?? ""),
          isTransfer: Number(row.isTransfer ?? 0) === 1,
          isIncluded: Number(row.isIncluded ?? 1) === 1,
          sourceFile: row.sourceFile ? String(row.sourceFile) : sourceFileName,
        };
      })
      .filter((row) => row.date && row.description);
  }

  function parseAssets(sheetRows) {
    return sheetRows
      .map((row) => mapRow(row, ASSET_HEADERS))
      .filter((row) => row.date)
      .map((row) => ({
        date: toDateString(row.date),
        total: toNumber(row.total),
        cash: toNumber(row.cash),
        stocks: toNumber(row.stocks),
        funds: toNumber(row.funds),
        points: toNumber(row.points),
      }))
      .filter((row) => row.date);
  }

  function parseCsvLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  function csvToJson(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (!lines.length) return [];
    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return row;
    });
  }

  async function readCsv(file) {
    const text = await file.text();
    return csvToJson(text);
  }

  async function readWorkbook(file) {
    if (!window.XLSX) {
      throw new Error("XLSX ライブラリが読み込めませんでした。");
    }
    const arrayBuffer = await file.arrayBuffer();
    return window.XLSX.read(arrayBuffer, { type: "array" });
  }

  function sheetToJson(workbook, preferredSheet) {
    const sheetName = workbook.SheetNames.includes(preferredSheet)
      ? preferredSheet
      : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(value);
  }

  function formatMonth(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function summarizeMonthly(items) {
    const map = new Map();
    for (const tx of items) {
      if (!tx.date) continue;
      const month = formatMonth(tx.date);
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

  function currentMonthSummary(items) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthly = items.filter((tx) => formatMonth(tx.date) === currentMonth);
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

  function topCategories(items, limit = 5) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const map = new Map();
    for (const tx of items) {
      if (tx.isTransfer || !tx.isIncluded) continue;
      if (formatMonth(tx.date) !== currentMonth) continue;
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

  function detectAlerts(items) {
    const alerts = [];
    const months = summarizeMonthly(items.filter((tx) => !tx.isTransfer && tx.isIncluded));
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

  function latestAssetSnapshot(items) {
    if (!items.length) return null;
    return items.slice().sort((a, b) => (a.date > b.date ? -1 : 1))[0];
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
    const start = filters.start.value ? new Date(filters.start.value) : null;
    const end = filters.end.value ? new Date(filters.end.value) : null;
    const keyword = filters.search.value.trim();
    const includeTransfer = filters.transfer.checked;
    const includeExcluded = filters.excluded.checked;

    const filtered = transactions.filter((tx) => {
      const txDate = new Date(tx.date);
      if (!includeTransfer && tx.isTransfer) return false;
      if (!includeExcluded && !tx.isIncluded) return false;
      if (start && txDate < start) return false;
      if (end && txDate > end) return false;
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
    transactions = await readAll("transactions");
    assets = await readAll("assets");
    renderDashboard();
    renderLedger();
    renderMonthlySummary();
  }

  function showEnvironmentNotice() {
    const isFile = window.location.protocol === "file:";
    if (isFile && !window.XLSX) {
      importResult.textContent =
        "注意: file:// で開いているため XLSX が読み込めません。CSVのみ取り込み可能です。";
    }
  }

  async function handleImport(file, type) {
    if (!file) return;
    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      let rows = [];
      if (isCsv) {
        rows = await readCsv(file);
      } else {
        const workbook = await readWorkbook(file);
        rows = sheetToJson(workbook, type === "transactions" ? "マスタ" : "資産推移");
      }

      if (type === "transactions") {
        const records = parseTransactions(rows, file.name);
        await upsertAll("transactions", records);
        importResult.textContent = `明細を ${records.length} 件取り込みました。`;
      } else {
        const records = parseAssets(rows);
        await upsertAll("assets", records);
        importResult.textContent = `資産推移を ${records.length} 件取り込みました。`;
      }
      await loadData();
    } catch (error) {
      importResult.textContent = `取込に失敗しました: ${error.message}`;
    }
  }

  async function setup() {
    if (!window.indexedDB) {
      dbStatus.textContent = "DB: IndexedDB が利用できません";
      return;
    }
    db = await openDb();
    dbStatus.textContent = "DB: 初期化済み";
    showEnvironmentNotice();
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
})();
