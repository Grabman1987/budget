import { cents, type Cents } from './cents';

/**
 * Amount field parser: German decimals, thousands dots and `+ − × ÷` / `+ - * /` arithmetic.
 * A hand-written tokenizer and exact rational arithmetic; there is no eval and no float math
 * (strict CSP, SPEC §2). Behaviour follows the prototype amount field (`design/prototype/app.js`)
 * and `reference/finance-hub/money-input.mjs`.
 */

export type AmountError = 'empty' | 'syntax' | 'precision' | 'divide-by-zero' | 'too-large';

export type ParseAmountResult = { ok: true; cents: Cents } | { ok: false; error: AmountError };

/** Maximum decimals of a stand-alone amount (a summand). Factors and divisors may carry more. */
const MAX_AMOUNT_DECIMALS = 2;
const MAX_FACTOR_DECIMALS = 6;

interface Rational {
  n: bigint;
  d: bigint;
}

type Token =
  { kind: 'num'; value: Rational; decimals: number } | { kind: 'op'; op: '+' | '-' | '*' | '/' };

class ParseError extends Error {
  constructor(readonly code: AmountError) {
    super(code);
  }
}

const NUMBER = /^(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+\.\d+)$/;
const TOKEN = /\d[\d.,]*|[+\-*/]/y;

function normalise(raw: string): string {
  return raw
    .replace(/[\s€]/g, '')
    .replace(/[×xX]/g, '*')
    .replace(/[÷:]/g, '/')
    .replace(/[\u2212\u2013]/g, '-');
}

function parseNumber(text: string): { value: Rational; decimals: number } {
  if (!NUMBER.test(text)) throw new ParseError('syntax');
  let normalized: string;
  if (text.includes(',')) normalized = text.replaceAll('.', '').replace(',', '.');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) normalized = text.replaceAll('.', '');
  else normalized = text;
  const [whole = '0', fraction = ''] = normalized.split('.');
  return {
    value: { n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length) },
    decimals: fraction.length,
  };
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < input.length) {
    TOKEN.lastIndex = pos;
    const match = TOKEN.exec(input);
    if (!match) throw new ParseError('syntax');
    const text = match[0];
    if (/^[+\-*/]$/.test(text)) tokens.push({ kind: 'op', op: text as '+' | '-' | '*' | '/' });
    else tokens.push({ kind: 'num', ...parseNumber(text) });
    pos += text.length;
  }
  return tokens;
}

const mul = (a: Rational, b: Rational): Rational => ({ n: a.n * b.n, d: a.d * b.d });
const add = (a: Rational, b: Rational): Rational => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const neg = (a: Rational): Rational => ({ n: -a.n, d: a.d });

function toCents(value: Rational): Cents {
  // Round half away from zero: exact integer division on the absolute value.
  const scaled = value.n * 100n;
  const abs = scaled < 0n ? -scaled : scaled;
  const rounded = (2n * abs + value.d) / (2n * value.d);
  const signed = scaled < 0n ? -rounded : rounded;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new ParseError('too-large');
  }
  return cents(Number(signed));
}

function evaluate(tokens: Token[]): Cents {
  // Trailing operators are ignored while the user is still typing ("12,50+").
  while (tokens.length > 0 && tokens[tokens.length - 1]?.kind === 'op') tokens.pop();

  // A leading sign applies to the first term ("-12,50+2" is -12,50 + 2).
  let pendingOp: '+' | '-' = '+';
  const first = tokens[0];
  if (first?.kind === 'op') {
    if (first.op === '*' || first.op === '/') throw new ParseError('syntax');
    if (first.op === '-') pendingOp = '-';
    tokens.shift();
  }
  if (tokens.length === 0) throw new ParseError('empty');

  // Grammar: expr = term (('+'|'-') term)* ; term = num (('*'|'/') num)*
  let total: Rational = { n: 0n, d: 1n };
  let i = 0;
  while (i < tokens.length) {
    const head = tokens[i++];
    if (head?.kind !== 'num') throw new ParseError('syntax');
    let term = head.value;
    let factors = 1;
    let maxDecimals = head.decimals;
    while (i < tokens.length) {
      const op = tokens[i];
      if (op?.kind !== 'op' || (op.op !== '*' && op.op !== '/')) break;
      const operand = tokens[i + 1];
      if (operand?.kind !== 'num') throw new ParseError('syntax');
      factors += 1;
      maxDecimals = Math.max(maxDecimals, operand.decimals);
      if (op.op === '*') term = mul(term, operand.value);
      else {
        if (operand.value.n === 0n) throw new ParseError('divide-by-zero');
        term = mul(term, { n: operand.value.d, d: operand.value.n });
      }
      i += 2;
    }
    const limit = factors === 1 ? MAX_AMOUNT_DECIMALS : MAX_FACTOR_DECIMALS;
    if (maxDecimals > limit) throw new ParseError('precision');
    total = add(total, pendingOp === '+' ? term : neg(term));
    if (i < tokens.length) {
      const next = tokens[i];
      if (next?.kind !== 'op' || (next.op !== '+' && next.op !== '-'))
        throw new ParseError('syntax');
      pendingOp = next.op;
      i += 1;
      if (i >= tokens.length) throw new ParseError('syntax');
    }
  }
  return toCents(total);
}

export function parseAmount(raw: string): ParseAmountResult {
  try {
    return { ok: true, cents: evaluate(tokenize(normalise(raw))) };
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, error: error.code };
    throw error;
  }
}

/** True when the input contains an operator between two numbers (drives the "= result" hint). */
export function hasOperator(raw: string): boolean {
  return /\d\s*[+\-*/×÷x:\u2212]\s*\d/.test(raw);
}
