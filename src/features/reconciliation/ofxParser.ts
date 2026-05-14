/**
 * Minimal OFX parser supporting both OFX 1.x (SGML) and OFX 2.x (XML).
 *
 * Brazilian banks typically emit OFX 1.06 SGML. We don't validate the SGML
 * grammar; instead we extract the few elements we care about (STMTTRN block,
 * FITID, DTPOSTED, TRNAMT, MEMO/NAME) using tag-pair regex which works for
 * both flavors after a light normalization.
 */

export interface OfxTransaction {
  fitId: string | null;
  postedAt: string; // ISO date YYYY-MM-DD
  amount: number; // signed
  description: string;
  documentRef: string | null;
  raw: Record<string, string>;
}

export interface OfxParseResult {
  bankId: string | null;
  accountId: string | null;
  currency: string | null;
  startDate: string | null;
  endDate: string | null;
  balance: number | null;
  transactions: OfxTransaction[];
}

function normalize(input: string): string {
  // Strip OFX header (everything before the first <OFX> tag for v1.x SGML).
  const idx = input.search(/<OFX/iu);
  const body = idx > 0 ? input.slice(idx) : input;
  return body.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").trim();
}

function extractAll(source: string, tag: string): string[] {
  // Match <TAG>value</TAG> AND SGML-style <TAG>value (no closer) followed by a newline or another tag.
  const re = new RegExp(`<${tag}>([^<\\n]+)`, "giu");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

function extractOne(source: string, tag: string): string | null {
  const arr = extractAll(source, tag);
  return arr[0] ?? null;
}

function parseOfxDate(raw: string): string {
  // OFX dates are YYYYMMDD[HHMMSS][.XXX][TZ]
  const m = /^(\d{4})(\d{2})(\d{2})/u.exec(raw.trim());
  if (!m) return raw;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function parseOfx(content: string): OfxParseResult {
  const body = normalize(content);

  // Extract STMTTRN blocks. We look for <STMTTRN>...</STMTTRN> blocks; for SGML
  // without explicit closers, we split by <STMTTRN> and drop the first segment.
  const blocks: string[] = [];
  const re = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|<LEDGERBAL>|<AVAILBAL>|$)/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    blocks.push(m[1]);
  }

  const transactions: OfxTransaction[] = blocks.map((block) => {
    const fitId = extractOne(block, "FITID");
    const dt = extractOne(block, "DTPOSTED") ?? extractOne(block, "DTUSER") ?? "";
    const amountRaw = extractOne(block, "TRNAMT") ?? "0";
    const memo = extractOne(block, "MEMO") ?? "";
    const name = extractOne(block, "NAME") ?? "";
    const checkNum = extractOne(block, "CHECKNUM");
    const refNum = extractOne(block, "REFNUM");
    const description = [name, memo].filter((s) => s.length > 0).join(" · ") || "Movimento";

    const raw: Record<string, string> = {};
    for (const tag of [
      "FITID",
      "DTPOSTED",
      "TRNAMT",
      "MEMO",
      "NAME",
      "TRNTYPE",
      "CHECKNUM",
      "REFNUM",
    ]) {
      const v = extractOne(block, tag);
      if (v != null) raw[tag] = v;
    }

    return {
      fitId,
      postedAt: parseOfxDate(dt),
      amount: Number.parseFloat(amountRaw.replace(",", ".")),
      description,
      documentRef: checkNum ?? refNum,
      raw,
    };
  });

  // Header metadata
  const bankId = extractOne(body, "BANKID");
  const accountId = extractOne(body, "ACCTID");
  const currency = extractOne(body, "CURDEF");
  const start = extractOne(body, "DTSTART");
  const end = extractOne(body, "DTEND");
  const balanceRaw = extractOne(body, "BALAMT");

  return {
    bankId,
    accountId,
    currency,
    startDate: start ? parseOfxDate(start) : null,
    endDate: end ? parseOfxDate(end) : null,
    balance: balanceRaw ? Number.parseFloat(balanceRaw.replace(",", ".")) : null,
    transactions: transactions.filter((t) => Number.isFinite(t.amount)),
  };
}
