const VALUES: [string, number][] = [
  ["M", 1000], ["CM", 900], ["D", 500], ["CD", 400], ["C", 100], ["XC", 90],
  ["L", 50], ["XL", 40], ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1],
];

export function romanToInt(roman: string): number {
  let n = 0;
  let rest = roman.toUpperCase();
  for (const [sym, val] of VALUES) {
    while (rest.startsWith(sym)) {
      n += val;
      rest = rest.slice(sym.length);
    }
  }
  return rest ? 0 : n;
}

export function intToRoman(n: number): string {
  let out = "";
  for (const [sym, val] of VALUES) {
    while (n >= val) {
      out += sym;
      n -= val;
    }
  }
  return out;
}
