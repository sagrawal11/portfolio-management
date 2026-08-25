export function fmtPct(x: number | null | undefined, digits = 2): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtSignedPct(x: number | null | undefined, digits = 2): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`;
}

export function fmtMoney(x: number | null | undefined, digits = 2): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return x.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtSignedMoney(x: number | null | undefined, digits = 2): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${x >= 0 ? '+' : '-'}${fmtMoney(Math.abs(x), digits)}`;
}

export function fmtNum(x: number | null | undefined, digits = 2): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
