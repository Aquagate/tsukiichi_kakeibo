(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.csvUtils = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const textDecoder =
    typeof TextDecoder !== "undefined"
      ? TextDecoder
      : require("util").TextDecoder;

  function normalizeHeader(header) {
    if (!header) return "";
    return header
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/[（）]/g, (match) => (match === "（" ? "(" : ")"))
      .replace(/\s+/g, " ");
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

  function parseCsvText(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (!lines.length) return { headers: [], rows: [], rowErrors: [] };
    const headers = parseCsvLine(lines[0]).map((header) => header.trim());
    const rows = [];
    const rowErrors = [];
    lines.slice(1).forEach((line, index) => {
      const values = parseCsvLine(line);
      const row = {};
      headers.forEach((header, headerIndex) => {
        row[header] = values[headerIndex] ?? "";
      });
      rows.push({ rowNumber: index + 2, values: row });
    });
    return { headers, rows, rowErrors };
  }

  function shouldFallbackToShiftJis(text, requiredHeadersNormalized = []) {
    const replacementCount = (text.match(/�/g) || []).length;
    if (replacementCount > 0) return true;
    const { headers } = parseCsvText(text);
    if (headers.length <= 1) return true;
    if (!requiredHeadersNormalized.length) return false;
    const normalizedHeaders = headers.map(normalizeHeader);
    return requiredHeadersNormalized.some(
      (required) => !normalizedHeaders.includes(required)
    );
  }

  function decodeCsvArrayBuffer(buffer, requiredHeadersNormalized = []) {
    const utf8Decoder = new textDecoder("utf-8", { fatal: false });
    let text = utf8Decoder.decode(buffer);
    let encoding = "utf-8";
    if (shouldFallbackToShiftJis(text, requiredHeadersNormalized)) {
      try {
        const sjisDecoder = new textDecoder("shift-jis", { fatal: false });
        text = sjisDecoder.decode(buffer);
        encoding = "shift-jis";
      } catch (error) {
        encoding = "utf-8";
      }
    }
    return { text, encoding };
  }

  return {
    normalizeHeader,
    parseCsvText,
    decodeCsvArrayBuffer,
  };
});
