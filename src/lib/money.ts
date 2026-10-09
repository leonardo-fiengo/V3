export function minor(value: string): bigint {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Invalid monetary value");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  return (
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) *
    (value.startsWith("-") ? -1n : 1n)
  );
}
export function decimal(value: bigint): string {
  const a = value < 0n ? -value : value;
  return (
    (value < 0n ? "-" : "") + a / 100n + "." + String(a % 100n).padStart(2, "0")
  );
}
export function formatMinor(
  value: bigint,
  locale: string,
  currency: string,
  sign = false,
): string {
  const neg = value < 0n,
    abs = neg ? -value : value;
  const whole = abs / 100n;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    signDisplay: sign ? "exceptZero" : "auto",
  });
  const sample = neg
    ? whole === 0n
      ? -1n
      : -whole
    : whole === 0n && value !== 0n
      ? 1n
      : whole;
  const digit = new Intl.NumberFormat(locale, { useGrouping: false });
  return formatter
    .formatToParts(sample)
    .map((p) => {
      if (p.type === "fraction")
        return String(abs % 100n)
          .padStart(2, "0")
          .split("")
          .map((n) => digit.format(Number(n)))
          .join("");
      if (p.type === "integer" && value !== 0n && whole === 0n)
        return digit.format(0);
      if (p.type === "plusSign" && value === 0n) return "";
      return p.value;
    })
    .join("");
}
export function chartNumber(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new Error("Invalid chart amount");
  const n = BigInt(value);
  if (
    n > BigInt(Number.MAX_SAFE_INTEGER) ||
    n < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("Chart value exceeds safe precision");
  return Number(n) / 100;
}
