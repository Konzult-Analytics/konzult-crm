export function rands(value: number): string {
  return `R${value.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
