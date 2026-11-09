// SPEC-4-005 — formato brasileiro num módulo só. Valor sem informação mostra "—", nunca 0.
export const SEM_VALOR = '—'
export const DICA_SEM_VALOR = 'sem informação'

const vazio = (v: unknown): boolean =>
  v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))

const paraNumero = (v: unknown): number | null => {
  if (vazio(v)) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** 1234.5 → "1.234,5". Sem casas inúteis (até `max` decimais). */
export const numero = (v: unknown, max = 3): string => {
  const n = paraNumero(v)
  if (n === null) return SEM_VALOR
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  }).format(n)
}

/** 1234.5 → "R$ 1.234,50". */
export const moeda = (v: unknown): string => {
  const n = paraNumero(v)
  if (n === null) return SEM_VALOR
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(n)
    .replace(/ /g, ' ')
}

/** 12.5, "kg" → "12,5 kg". Sem valor, só "—" (a unidade não aparece sozinha). */
export const quantidade = (v: unknown, unidade?: string | null, max = 3): string => {
  const n = paraNumero(v)
  if (n === null) return SEM_VALOR
  const u = String(unidade ?? '').trim()
  return u ? `${numero(n, max)} ${u}` : numero(n, max)
}

const ehSoData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const paraData = (v: unknown): Date | null => {
  if (vazio(v)) return null
  const d =
    v instanceof Date ? v : new Date(ehSoData(String(v)) ? `${v}T12:00:00-03:00` : String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

/** "2026-11-09" ou instante → "09/11/2026" (dia de São Paulo). */
export const data = (v: unknown): string => {
  const d = paraData(v)
  if (!d) return SEM_VALOR
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** Instante → "14:30" (horário de São Paulo). */
export const hora = (v: unknown): string => {
  const d = paraData(v)
  if (!d || (typeof v === 'string' && ehSoData(v))) return SEM_VALOR
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** Instante → "09/11/2026 14:30". */
export const dataEHora = (v: unknown): string => {
  const h = hora(v)
  return h === SEM_VALOR ? data(v) : `${data(v)} ${h}`
}
