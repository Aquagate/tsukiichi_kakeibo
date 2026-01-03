import * as XLSX from "xlsx";

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
  "預金・現金・暗号資産（円）": "cash",
  "株式(現物)（円）": "stocks",
  "投資信託（円）": "funds",
  "ポイント（円）": "points",
};

export async function readWorkbook(file) {
  const arrayBuffer = await file.arrayBuffer();
  return XLSX.read(arrayBuffer, { type: "array" });
}

function normalizeHeader(header) {
  return header?.trim() ?? "";
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
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
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

export function parseTransactions(sheetRows, sourceFileName = "") {
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

export function parseAssets(sheetRows) {
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

export function sheetToJson(workbook, preferredSheet) {
  const sheetName = workbook.SheetNames.includes(preferredSheet)
    ? preferredSheet
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}
