const integerFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function formatInteger(value: number): string { return integerFormatter.format(value); }
export function formatMegabytes(value: number): string { return `${decimalFormatter.format(value)} MB`; }
export function formatPercent(value: number): string { return `${integerFormatter.format(value)}%`; }
