/**
 * Reads meaning out of OCR text, on the phone: which dates matter (expiry, due, issue),
 * warranty periods, totals, and what kind of document it is. Pure functions, fully tested.
 */
export type DateKind = 'expiry' | 'due' | 'warranty' | 'issued' | 'other';
export type DocType = 'receipt' | 'bill' | 'invoice' | 'id' | 'warranty' | 'prescription' | 'document';

export interface DetectedDate {
  /** YYYY-MM-DD in local time. */
  iso: string;
  kind: DateKind;
  raw: string;
  context: string;
}

export interface Amount {
  value: number;
  currency: string;
  raw: string;
}

export interface Analysis {
  type: DocType;
  title: string;
  dates: DetectedDate[];
  amount: Amount | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const KIND_WORDS: [DateKind, RegExp][] = [
  ['expiry', /\b(exp(iry|ires?|iration)?|valid\s+(till|until|upto|up\s+to|thru|through)|best\s+before|use\s+by|date\s+of\s+expiry)\b\.?/i],
  ['due', /\b(due(\s+date)?|pay(ment)?\s+(by|before)|last\s+date|payable\s+(by|before))\b/i],
  ['issued', /\b(issued?(\s+on)?|date\s+of\s+issue|invoice\s+date|bill\s+date|purchase(d)?(\s+date)?|date\s+of\s+purchase|billing\s+date|reading\s+date)\b/i],
];
const BIRTH = /\b(date\s+of\s+birth|d\.?o\.?b|born)\b/i;

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

function validDate(y: number, m: number, d: number): boolean {
  return y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function fullYear(y: number): number {
  if (y >= 100) return y;
  return y + (y >= 70 ? 1900 : 2000);
}

interface RawDate {
  index: number;
  raw: string;
  y: number;
  m: number;
  d: number;
}

function findRawDates(text: string): RawDate[] {
  const out: RawDate[] = [];
  const taken: [number, number][] = [];
  const add = (index: number, raw: string, y: number, m: number, d: number) => {
    if (!validDate(y, m, d)) return;
    if (taken.some(([s, e]) => index < e && index + raw.length > s)) return;
    taken.push([index, index + raw.length]);
    out.push({ index, raw, y, m, d });
  };
  let match: RegExpExecArray | null;

  // 2027-03-12
  const isoRe = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
  while ((match = isoRe.exec(text))) add(match.index, match[0], +match[1], +match[2], +match[3]);

  // 12/03/2027, 12-03-27 (day first, as used in Pakistan and most of the world)
  const dmyRe = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/g;
  while ((match = dmyRe.exec(text))) add(match.index, match[0], fullYear(+match[3]), +match[2], +match[1]);

  // 12 Mar 2027, 12-Mar-27, 12th March, 2027
  const dMonY = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-./]*${MONTH_RE}\\.?[\\s\\-.,/]*(\\d{4}|\\d{2})\\b`, 'gi');
  while ((match = dMonY.exec(text))) add(match.index, match[0], fullYear(+match[3]), MONTHS[match[2].toLowerCase()], +match[1]);

  // March 12, 2027
  const monDY = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi');
  while ((match = monDY.exec(text))) add(match.index, match[0], +match[3], MONTHS[match[1].toLowerCase()], +match[2]);

  // Month and year only (cards, medicines): "Mar 2027", "EXP 08/27". These mean the end of that month.
  const monY = new RegExp(`\\b${MONTH_RE}\\.?[\\s\\-/,]+(\\d{4})\\b`, 'gi');
  while ((match = monY.exec(text))) {
    const y = +match[2];
    const m = MONTHS[match[1].toLowerCase()];
    add(match.index, match[0], y, m, daysInMonth(y, m));
  }
  const mmYY = /\b(?:exp(?:iry|ires)?|valid\s+thru|use\s+by)\.?\s*:?\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})\b/gi;
  while ((match = mmYY.exec(text))) {
    const m = +match[1];
    const y = fullYear(+match[2]);
    const start = match.index + match[0].indexOf(match[1]);
    if (m >= 1 && m <= 12) add(start, match[0].slice(match[0].indexOf(match[1])), y, m, daysInMonth(y, m));
  }
  return out.sort((a, b) => a.index - b.index);
}

/** The words just before a date (same line, or the line above for table layouts) decide its kind. */
function contextBefore(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const sameLine = text.slice(lineStart, index);
  if (/[a-z]{3}/i.test(sameLine)) return sameLine.slice(-60);
  const prevStart = text.lastIndexOf('\n', lineStart - 2) + 1;
  return text.slice(prevStart, index).slice(-80);
}

function kindOf(context: string): DateKind | 'birth' {
  let best: { kind: DateKind | 'birth'; at: number } | null = null;
  const births = [...context.matchAll(new RegExp(BIRTH.source, 'gi'))];
  const lastBirth = births[births.length - 1];
  if (lastBirth) best = { kind: 'birth', at: lastBirth.index ?? 0 };
  for (const [kind, re] of KIND_WORDS) {
    // The keyword closest to the date wins: "Issued 01/01/2026 Expires 01/01/2031".
    const all = [...context.matchAll(new RegExp(re.source, 'gi'))];
    const last = all[all.length - 1];
    if (last && (best === null || (last.index ?? 0) > best.at)) best = { kind, at: last.index ?? 0 };
  }
  return best?.kind ?? 'other';
}

const WARRANTY = /\b(?:warranty|guarantee)\b[^\n\d]{0,20}(\d{1,2})\s*(year|yr|month|mon|mo)s?\b|\b(\d{1,2})\s*(year|yr|month|mon|mo)s?\.?\s*(?:limited\s+)?(?:warranty|guarantee)\b/i;

export function findDates(text: string): DetectedDate[] {
  const seen = new Set<string>();
  const out: DetectedDate[] = [];
  for (const raw of findRawDates(text)) {
    const context = contextBefore(text, raw.index);
    const kind = kindOf(context);
    if (kind === 'birth') continue;
    const iso = toIso(raw.y, raw.m, raw.d);
    const id = `${iso}:${kind}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ iso, kind, raw: raw.raw.trim(), context: context.trim() });
  }

  // A warranty period plus a purchase date gives the warranty's end date.
  const w = WARRANTY.exec(text);
  if (w) {
    const amount = Number(w[1] ?? w[3]);
    const unit = (w[2] ?? w[4]).toLowerCase();
    const start = out.find((d) => d.kind === 'issued') ?? out.find((d) => d.kind === 'other');
    if (start && amount > 0) {
      const [y, m, d] = start.iso.split('-').map(Number);
      const months = unit.startsWith('y') ? amount * 12 : amount;
      const end = new Date(y, m - 1 + months, d);
      out.push({ iso: toIso(end.getFullYear(), end.getMonth() + 1, end.getDate()), kind: 'warranty', raw: w[0].trim(), context: `${w[0].trim()} from ${start.raw}` });
    }
  }
  return out;
}

const CURRENCY = '(rs\\.?|pkr|usd|\\$|aed|sar|eur|€|gbp|£)';
const TOTAL_WORDS = /\b(grand\s+total|net\s+payable|amount\s+payable|amount\s+due|payable\s+within\s+due\s+date|total\s+amount|total\s+due|balance\s+due|total)\b(?!\s*(items?|qty|quantity|units?|savings?|discount|tax|weight|kwh|pieces|pcs)\b)/i;
const SUBTOTAL = /\b(sub\s*-?\s*total)\b/i;

export function findAmount(text: string): Amount | null {
  const lines = text.split('\n');
  let best: Amount | null = null;
  let bestScore = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SUBTOTAL.test(line)) continue;
    const label = TOTAL_WORDS.exec(line);
    if (!label) continue;
    // The figure is on the same line, or on the next line in two-column layouts. Dates are blanked
    // out first so "Amount due 15-11-2026" never reads as 15.
    const raw = `${line.slice(label.index + label[0].length)} ${lines[i + 1] ?? ''}`;
    const search = raw
      .replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ')
      .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?[\\s-]*${MONTH_RE}[\\s,.-]*\\d{2,4}\\b`, 'gi'), ' ');
    const re = new RegExp(`${CURRENCY}?\\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(\\.[0-9]{1,2})?\\s*${CURRENCY}?`, 'i');
    const m = re.exec(search);
    if (!m) continue;
    const value = Number(`${m[2].replace(/,/g, '')}${m[3] ?? ''}`);
    if (!Number.isFinite(value) || value <= 0) continue;
    const currencyRaw = (m[1] ?? m[4] ?? '').toLowerCase();
    const currency = currencyRaw.startsWith('rs') || currencyRaw === 'pkr' ? 'PKR' : currencyRaw === '$' || currencyRaw === 'usd' ? 'USD' : currencyRaw === '€' || currencyRaw === 'eur' ? 'EUR' : currencyRaw === '£' || currencyRaw === 'gbp' ? 'GBP' : currencyRaw.toUpperCase();
    // "Grand total" beats "subtotal"-like plain "total"; later lines usually hold the final figure.
    const hasCurrency = Boolean(m[1] || m[4]);
    const score = (/grand|net|payable|due|balance/i.test(label[0]) ? 2 : 1) * 1000 + (hasCurrency ? 500 : 0) + i;
    if (score > bestScore) {
      bestScore = score;
      best = { value, currency, raw: m[0].trim() };
    }
  }
  return best;
}

const TYPE_SIGNALS: Record<Exclude<DocType, 'document'>, RegExp> = {
  receipt: /\b(receipt|cash|change|qty|thank\s+you|cashier|pos|item)\b/gi,
  bill: /\b(bill|consumer|meter|units|kwh|reading|lesco|k-electric|sngpl|ssgc|ptcl|wasa|iesco|fesco|gepco|mepco|tariff|billing\s+month)\b/gi,
  invoice: /\b(invoice|ntn|strn|sales\s+tax|tax\s+invoice|bill\s+to|ship\s+to)\b/gi,
  id: /\b(identity|cnic|nadra|passport|nationality|licen[cs]e|date\s+of\s+birth|holder|father\s+name|national)\b/gi,
  warranty: /\b(warranty|guarantee|serial\s+(no|number)|model\s+(no|number))\b/gi,
  prescription: /\b(rx|prescription|tablet|tab\.|capsule|cap\.|syrup|mg|dosage|twice\s+daily|once\s+daily|dr\.|clinic|hospital)\b/gi,
};

export function classify(text: string): DocType {
  let best: DocType = 'document';
  let bestScore = 1;
  for (const [type, re] of Object.entries(TYPE_SIGNALS) as [Exclude<DocType, 'document'>, RegExp][]) {
    const score = text.match(re)?.length ?? 0;
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
}

export const TYPE_LABELS: Record<DocType, string> = {
  receipt: 'Receipt',
  bill: 'Bill',
  invoice: 'Invoice',
  id: 'ID card',
  warranty: 'Warranty',
  prescription: 'Prescription',
  document: 'Document',
};

export function suggestTitle(text: string, type: DocType): string {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => /[a-z]{3}/i.test(l) && l.length <= 48 && !/\d{4,}/.test(l));
  const head = lines.slice(0, 5);
  const pick = head.find((l) => l === l.toUpperCase() && l.length >= 4) ?? head[0];
  const tidy = pick ? pick.replace(/\s+/g, ' ').replace(/^[^a-z0-9]+|[^a-z0-9)]+$/gi, '') : '';
  const titled = tidy && tidy === tidy.toUpperCase() ? tidy.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : tidy;
  return titled || TYPE_LABELS[type];
}

export function analyze(text: string): Analysis {
  const type = classify(text);
  return { type, title: suggestTitle(text, type), dates: findDates(text), amount: findAmount(text) };
}
