/** Utilidades de texto, número e data usadas na leitura dos exports. */

/** Maiúsculas, sem acentos e com espaços simples — base de toda comparação de nomes. */
export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Converte número no padrão brasileiro ("1.234,50") ou número nativo. */
export function num(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).trim().replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

/** Converte dd/mm/aaaa[ hh:mm], AAAA-MM-DD, Date ou número serial do Excel para AAAA-MM-DD. */
export function iso(s: unknown): string {
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  if (typeof s === 'number') return new Date(Math.round((s - 25569) * 864e5)).toISOString().slice(0, 10);
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}

/** Código numérico como texto, sem zeros à esquerda ("00403" → "403"). */
export function cod(v: unknown): string {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? '' : String(n);
}
