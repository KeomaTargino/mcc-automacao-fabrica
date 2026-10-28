/**
 * Complemento do fornecedor — SPEC-3-003, CA-3-09 (RN-05).
 *
 * O fornecedor vem do Omie; aqui ficam só os dados que o Omie não guarda: contatos (nome, função,
 * telefone, e-mail, um por linha, cada dado no seu campo), prazo de entrega em dias e observação.
 * Cada alteração gera uma versão com autor e hora. O cadastro do Omie nunca é alterado. Contatos
 * ficam no banco do Skip, nunca no Git.
 */
import { exigirAcao, type PerfilAcesso } from './acoes-compras.ts'

export interface Contato {
  nome: string
  funcao: string
  telefone: string
  email: string
}

export interface ComplementoFornecedor {
  fornecedor: string
  contatos: Contato[]
  prazoEntregaDias: number | null
  observacao: string
  versao: number
  alteradoPor: string
  alteradoEm: string
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RE_TEL = /^[0-9+()\-.\s]{8,20}$/

export function validarContatos(contatos: Contato[]): string[] {
  const erros: string[] = []
  contatos.forEach((c, i) => {
    const n = i + 1
    const nome = String(c.nome ?? '').trim()
    const email = String(c.email ?? '').trim()
    const tel = String(c.telefone ?? '').trim()
    if (!nome) erros.push('contato ' + n + ': nome obrigatório')
    if (nome.indexOf('@') !== -1 || nome.replace(/\D/g, '').length >= 8) {
      erros.push('contato ' + n + ': coloque e-mail e telefone nos campos próprios, não no nome')
    }
    if (email && !RE_EMAIL.test(email)) erros.push('contato ' + n + ': e-mail inválido')
    if (tel && !RE_TEL.test(tel)) erros.push('contato ' + n + ': telefone inválido')
  })
  return erros
}

export type ResultadoComplemento =
  | { ok: true; complemento: ComplementoFornecedor }
  | { ok: false; http: 403; erro: 'sem_permissao' }
  | { ok: false; http: 422; erro: 'dados_invalidos'; motivos: string[] }

/** Grava uma versão nova do complemento (a anterior fica como estava). Exige `editar_fornecedor`. */
export function salvarComplemento(entrada: {
  perfil: PerfilAcesso | null
  usuario: string
  fornecedor: string
  contatos: Contato[]
  prazoEntregaDias: number | null
  observacao?: string
  anterior: ComplementoFornecedor | null
  agora: Date
}): ResultadoComplemento {
  if (!exigirAcao(entrada.perfil, 'editar_fornecedor').permitido) {
    return { ok: false, http: 403, erro: 'sem_permissao' }
  }
  const motivos = validarContatos(entrada.contatos)
  if (!String(entrada.fornecedor ?? '').trim()) motivos.push('fornecedor obrigatório')
  const prazo = entrada.prazoEntregaDias
  if (prazo !== null && (!Number.isInteger(prazo) || prazo < 0 || prazo > 365)) {
    motivos.push('prazo de entrega precisa ser um número inteiro de dias, de 0 a 365')
  }
  if (motivos.length > 0) return { ok: false, http: 422, erro: 'dados_invalidos', motivos }
  return {
    ok: true,
    complemento: {
      fornecedor: String(entrada.fornecedor).trim(),
      contatos: entrada.contatos.map((c) => ({
        nome: c.nome.trim(),
        funcao: String(c.funcao ?? '').trim(),
        telefone: String(c.telefone ?? '').trim(),
        email: String(c.email ?? '').trim(),
      })),
      prazoEntregaDias: prazo,
      observacao: String(entrada.observacao ?? '')
        .trim()
        .slice(0, 500),
      versao: (entrada.anterior?.versao ?? 0) + 1,
      alteradoPor: entrada.usuario,
      alteradoEm: entrada.agora.toISOString(),
    },
  }
}
