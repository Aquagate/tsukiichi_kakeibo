const assert = require("assert");
const { decodeCsvArrayBuffer, parseCsvText, normalizeHeader } = require("../src/csv-utils");

const sampleCsv = `日付, 合計（円）, 預金・現金・暗号資産（円）
2026/1/4,15524345,7004697
2026/1/3,15524345,7004697
`;

const parsed = parseCsvText(sampleCsv);
assert.strictEqual(parsed.headers.length, 3);
assert.strictEqual(parsed.rows.length, 2);
assert.strictEqual(parsed.headers[0], "日付");

const required = [normalizeHeader("日付"), normalizeHeader("合計(円)")];
const buffer = Buffer.from(sampleCsv, "utf8");
const decoded = decodeCsvArrayBuffer(buffer, required);
assert.strictEqual(decoded.encoding, "utf-8");

const normalized = normalizeHeader(" 合計（円） ");
assert.strictEqual(normalized, "合計(円)");

console.log("csv-utils tests passed");
