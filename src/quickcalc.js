// Instant answers that don't use a chat: "calc 2+2*7", "convert 5mi to km", "= 15% of 80".
// Safe expression parser (no eval) + a unit table.

// ---------- Calculator
const FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: x => Math.sin(x), cos: x => Math.cos(x), tan: x => Math.tan(x), asin: Math.asin, acos: Math.acos, atan: Math.atan,
  log: Math.log10, ln: Math.log, log2: Math.log2, exp: Math.exp
};
const CONSTS = { pi: Math.PI, π: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenize(src) {
  const s = src.replace(/\bof\b/gi, '*').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,(?=\d{3}\b)/g, '').replace(/\s+/g, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const num = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
    if (num) { out.push({ t: 'n', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const word = s.slice(i).match(/^[a-zπ][a-z0-9]*/i);
    if (word) { out.push({ t: 'w', v: word[0].toLowerCase() }); i += word[0].length; continue; }
    if ('+-*/^%()!'.includes(c)) { out.push({ t: 'o', v: c }); i++; continue; }
    if (c === '*' && s[i + 1] === '*') { out.push({ t: 'o', v: '^' }); i += 2; continue; }
    throw new Error(`I can't read "${c}".`);
  }
  return out;
}
// Recursive descent: expr = term (+|- term)*; term = power ((*|/|implicit) power)*; power = unary (^ power)?; unary = -unary | postfix
function calc(src) {
  const toks = tokenize(src.replace(/\*\*/g, '^'));
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const isOp = (v) => peek()?.t === 'o' && peek().v === v;
  function expr() {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = next().v;
      // "80 + 15%" → 80 * 1.15
      const r = term();
      v = op === '+' ? v + (r.pct ? v * r.pct : +r) : v - (r.pct ? v * r.pct : +r);
    }
    return +v;
  }
  function term() {
    let v = power();
    for (;;) {
      if (isOp('*') || isOp('/')) { const op = next().v; const r = +power(); v = op === '*' ? +v * r : +v / r; continue; }
      if (peek() && (peek().t === 'n' || peek().t === 'w' || isOp('('))) { v = +v * +power(); continue; } // 2pi, 3(4)
      if (peek()?.t === 'w' && peek().v === 'of') { next(); v = +v * +power(); continue; }
      return v;
    }
  }
  function power() {
    const b = unary();
    if (isOp('^')) { next(); return Math.pow(+b, +power()); }
    return b;
  }
  function unary() {
    if (isOp('-')) { next(); return -unary(); }
    if (isOp('+')) { next(); return +unary(); }
    let v = atom();
    for (;;) {
      if (isOp('%')) { next(); const n = +v / 100; v = Object.assign(new Number(n), { pct: n }); continue; }
      if (isOp('!')) { next(); const n = +v; if (n < 0 || n > 170 || n % 1) throw new Error('Factorial needs a whole number 0–170.'); let f = 1; for (let k = 2; k <= n; k++) f *= k; v = f; continue; }
      if (peek()?.t === 'w' && peek().v === 'of') { next(); v = +v * +unary(); continue; }
      return v;
    }
  }
  function atom() {
    const t = next();
    if (!t) throw new Error('The expression ends too early.');
    if (t.t === 'n') return t.v;
    if (t.t === 'o' && t.v === '(') { const v = expr(); if (!isOp(')')) throw new Error('Missing ")".'); next(); return v; }
    if (t.t === 'w') {
      if (t.v in CONSTS) return CONSTS[t.v];
      if (t.v in FUNCS) {
        if (isOp('(')) { next(); const v = expr(); if (!isOp(')')) throw new Error('Missing ")".'); next(); return FUNCS[t.v](v); }
        return FUNCS[t.v](+unary());
      }
      throw new Error(`I don't know "${t.v}".`);
    }
    throw new Error(`Unexpected "${t.v}".`);
  }
  const v = expr();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i].v}".`);
  if (!isFinite(v)) throw new Error(isNaN(v) ? "That isn't a number." : 'The answer is infinite.');
  return v;
}
function fmt(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString('en-US');
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-6 && n !== 0)) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return (+n.toPrecision(12)).toLocaleString('en-US', { maximumFractionDigits: 10 });
}

// ---------- Units (factor to the base unit of each dimension)
const U = {};
function def(dim, factor, ...names) { for (const n of names) U[n.toLowerCase()] = { dim, factor }; }
// length (m)
def('length', 1, 'm', 'meter', 'meters', 'metre', 'metres'); def('length', 1000, 'km', 'kilometer', 'kilometers', 'kilometre', 'kilometres');
def('length', 0.01, 'cm', 'centimeter', 'centimeters'); def('length', 0.001, 'mm', 'millimeter', 'millimeters');
def('length', 1609.344, 'mi', 'mile', 'miles'); def('length', 0.9144, 'yd', 'yard', 'yards'); def('length', 0.3048, 'ft', 'foot', 'feet', "'");
def('length', 0.0254, 'in', 'inch', 'inches', '"'); def('length', 1852, 'nmi', 'nautical mile', 'nautical miles');
// mass (kg)
def('mass', 1, 'kg', 'kilogram', 'kilograms', 'kilo', 'kilos'); def('mass', 0.001, 'g', 'gram', 'grams'); def('mass', 1e-6, 'mg', 'milligram', 'milligrams');
def('mass', 0.45359237, 'lb', 'lbs', 'pound', 'pounds'); def('mass', 0.028349523125, 'oz', 'ounce', 'ounces'); def('mass', 6.35029318, 'st', 'stone', 'stones');
def('mass', 1000, 't', 'tonne', 'tonnes', 'metric ton', 'metric tons'); def('mass', 907.18474, 'ton', 'tons', 'short ton', 'short tons');
// volume (L)
def('volume', 1, 'l', 'liter', 'liters', 'litre', 'litres'); def('volume', 0.001, 'ml', 'milliliter', 'milliliters');
def('volume', 3.785411784, 'gal', 'gallon', 'gallons'); def('volume', 0.946352946, 'qt', 'quart', 'quarts'); def('volume', 0.473176473, 'pt', 'pint', 'pints');
def('volume', 0.2365882365, 'cup', 'cups'); def('volume', 0.0295735295625, 'floz', 'fl oz', 'fluid ounce', 'fluid ounces');
def('volume', 0.01478676478125, 'tbsp', 'tablespoon', 'tablespoons'); def('volume', 0.00492892159375, 'tsp', 'teaspoon', 'teaspoons');
// time (s)
def('time', 1, 's', 'sec', 'secs', 'second', 'seconds'); def('time', 60, 'min', 'mins', 'minute', 'minutes'); def('time', 3600, 'h', 'hr', 'hrs', 'hour', 'hours');
def('time', 86400, 'd', 'day', 'days'); def('time', 604800, 'wk', 'week', 'weeks'); def('time', 31557600, 'yr', 'year', 'years'); def('time', 0.001, 'ms', 'millisecond', 'milliseconds');
// speed (m/s)
def('speed', 1, 'm/s', 'mps'); def('speed', 1000 / 3600, 'km/h', 'kmh', 'kph'); def('speed', 1609.344 / 3600, 'mph', 'mi/h'); def('speed', 1852 / 3600, 'kn', 'knot', 'knots'); def('speed', 0.3048, 'ft/s', 'fps');
// area (m²)
def('area', 1, 'm2', 'm²', 'sq m', 'square meter', 'square meters'); def('area', 1e6, 'km2', 'km²', 'sq km'); def('area', 0.09290304, 'ft2', 'ft²', 'sq ft', 'square feet');
def('area', 4046.8564224, 'acre', 'acres'); def('area', 10000, 'ha', 'hectare', 'hectares'); def('area', 2589988.110336, 'mi2', 'mi²', 'sq mi', 'square miles');
// data (bytes)
def('data', 1, 'b', 'byte', 'bytes'); def('data', 1000, 'kb', 'kilobyte', 'kilobytes'); def('data', 1e6, 'mb', 'megabyte', 'megabytes'); def('data', 1e9, 'gb', 'gigabyte', 'gigabytes'); def('data', 1e12, 'tb', 'terabyte', 'terabytes');
def('data', 1024, 'kib'); def('data', 1048576, 'mib'); def('data', 1073741824, 'gib'); def('data', 1099511627776, 'tib'); def('data', 0.125, 'bit', 'bits');
// energy (J)
def('energy', 1, 'j', 'joule', 'joules'); def('energy', 4184, 'kcal', 'calorie', 'calories', 'cal'); def('energy', 3.6e6, 'kwh'); def('energy', 1000, 'kj');
const TEMP = { c: 'C', celsius: 'C', '°c': 'C', f: 'F', fahrenheit: 'F', '°f': 'F', k: 'K', kelvin: 'K' };
const toC = { C: v => v, F: v => (v - 32) * 5 / 9, K: v => v - 273.15 };
const fromC = { C: v => v, F: v => v * 9 / 5 + 32, K: v => v + 273.15 };
const tempName = { C: '°C', F: '°F', K: 'K' };

function convert(src) {
  const m = src.trim().match(/^(-?[\d.,]+(?:e[+-]?\d+)?)\s*(.+?)\s+(?:to|in|into|as|->|→)\s+(.+)$/i);
  if (!m) throw new Error('Try "convert 5 mi to km".');
  const value = parseFloat(m[1].replace(/,/g, ''));
  const from = m[2].trim().toLowerCase().replace(/^degrees?\s+/, ''), to = m[3].trim().toLowerCase().replace(/^degrees?\s+/, '');
  if (TEMP[from] && TEMP[to]) {
    const r = fromC[TEMP[to]](toC[TEMP[from]](value));
    return { value: r, text: `${fmt(value)} ${tempName[TEMP[from]]} = **${fmt(+r.toFixed(2))} ${tempName[TEMP[to]]}**` };
  }
  const a = U[from], b = U[to];
  if (!a) throw new Error(`I don't know the unit "${m[2]}".`);
  if (!b) throw new Error(`I don't know the unit "${m[3]}".`);
  if (a.dim !== b.dim) throw new Error(`Can't convert ${a.dim} to ${b.dim}.`);
  const r = value * a.factor / b.factor;
  return { value: r, text: `${fmt(value)} ${m[2].trim()} = **${fmt(+r.toPrecision(10))} ${m[3].trim()}**` };
}

// Returns { kind, text } for a quick command, or null if the input isn't one.
function quick(input) {
  const t = String(input || '').trim();
  let m;
  if ((m = t.match(/^(?:\/?calc(?:ulate)?|=)\s+(.+)$/i))) {
    try { const v = calc(m[1]); return { kind: 'calc', text: `${m[1].trim()} = **${fmt(v)}**`, value: v }; }
    catch (e) { return { kind: 'calc', text: e.message, error: true }; }
  }
  if ((m = t.match(/^\/?convert\s+(.+)$/i))) {
    try { const r = convert(m[1]); return { kind: 'convert', text: r.text, value: r.value }; }
    catch (e) { return { kind: 'convert', text: e.message, error: true }; }
  }
  return null;
}

module.exports = { quick, calc, convert, fmt };
