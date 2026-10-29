import pb from '@/lib/pocketbase/client'

export interface LinhaResumo {
  colecao: string
  registros: number | null
  exportada: boolean
  motivo: string | null
}

export interface ResumoExportacao {
  identificacao: string
  gerado_em: string
  versao_sistema: string
  completo: boolean
  linhas: LinhaResumo[]
}

export interface ColecaoExportada {
  colecao: string
  exportada: boolean
  registros: number | null
  motivo?: string
  csv?: string
}

export const obterResumoExportacao = () =>
  pb.send('/backend/v1/pcp/exportacao', { method: 'GET' }) as Promise<ResumoExportacao>

export const obterColecaoExportada = (colecao: string) =>
  pb.send('/backend/v1/pcp/exportacao', {
    method: 'GET',
    query: { colecao },
  }) as Promise<ColecaoExportada>

const cel = (v: string | number | null) => {
  const s = v === null ? '' : String(v)
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/** Resumo em CSV: coleção, registros, no pacote, observação, data e versão do sistema. */
export function resumoParaCsv(r: ResumoExportacao): string {
  const cab = [
    'coleção',
    'registros',
    'no pacote',
    'observação',
    'gerado em',
    'versão do sistema',
    'identificação',
  ]
  const linhas = r.linhas.map((l) => [
    l.colecao,
    l.registros,
    l.exportada ? 'sim' : 'não',
    l.motivo,
    r.gerado_em,
    r.versao_sistema,
    r.identificacao,
  ])
  return [cab, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n')
}

// ZIP mínimo (sem compressão) para entregar o pacote como um arquivo só.
const TABELA = (() => {
  const t: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t.push(c >>> 0)
  }
  return t
})()
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TABELA[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function montarZip(arquivos: { nome: string; conteudo: string }[], agora: Date): Blob {
  const enc = new TextEncoder()
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let deslocamento = 0
  const hora =
    ((agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1)) & 0xffff
  const data =
    (((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate()) & 0xffff
  for (const a of arquivos) {
    const nome = enc.encode(a.nome)
    const dados = enc.encode('﻿' + a.conteudo)
    const crc = crc32(dados)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // nomes em UTF-8
    local.setUint16(8, 0, true)
    local.setUint16(10, hora, true)
    local.setUint16(12, data, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, dados.length, true)
    local.setUint32(22, dados.length, true)
    local.setUint16(26, nome.length, true)
    local.setUint16(28, 0, true)
    partes.push(new Uint8Array(local.buffer), nome, dados)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, hora, true)
    c.setUint16(14, data, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, dados.length, true)
    c.setUint32(24, dados.length, true)
    c.setUint16(28, nome.length, true)
    c.setUint32(42, deslocamento, true)
    central.push(new Uint8Array(c.buffer), nome)
    deslocamento += 30 + nome.length + dados.length
  }
  const tamCentral = central.reduce((t, p) => t + p.length, 0)
  const fim = new DataView(new ArrayBuffer(22))
  fim.setUint32(0, 0x06054b50, true)
  fim.setUint16(8, arquivos.length, true)
  fim.setUint16(10, arquivos.length, true)
  fim.setUint32(12, tamCentral, true)
  fim.setUint32(16, deslocamento, true)
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)] as BlobPart[], {
    type: 'application/zip',
  })
}
