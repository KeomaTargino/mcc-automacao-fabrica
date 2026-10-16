/**
 * Provas de recuperação antes do envio real — SPEC-2-005 (task 4e9a1d0e), CA-O2/O3/O4.
 *
 * Contrato puro sobre a fila mock (fila-omie.ts). NENHUM POST real: aqui os
 * guards são provados com fixtures. Casos da SPEC:
 * - O2: aprovar 100 e REVOGAR executar_sync_omie antes da aquisição/envio → 403 e zero POST.
 * - O4: queda/reinício — tentativa 'enviando' sem resposta é potencialmente enviada:
 *   apenas consultar/reconciliar; reinício → consulta → confirmada com POST total 1.
 * - O3: barreira entre aquisição e POST — retificação 99 concorrente → 409 e hash 100
 *   permanece; retificação ANTES da aquisição → hash inválido (aprovação invalidada)
 *   e zero POST 100; timeout mantém o congelamento (reconciliarPorConsulta).
 * - Transversal: perfil administrativo funcional NÃO edita/exclui tentativas/hashes
 *   aprovados diretamente (403); manutenção privilegiada não é reprocessamento operacional.
 */

import {
  enviarComAquisicao,
  reconciliarPorConsulta,
  type Transacao,
  type AdapterMock,
  type ResultadoEnvio,
} from './fila-omie'

export interface ContaSync {
  acoes: string[]
  usuario: string
}

/**
 * O2: envio com guarda de ação — revogação observada antes do envio cancela a
 * tentativa SEM POST (não há como desfazer chamada já aceita; aqui nada foi aceito).
 */
export function enviarComGuardaAcao(
  t: Transacao,
  conta: ContaSync,
  payload: unknown,
  adapter: AdapterMock,
  agora: Date,
  leaseMs: number,
  temLease: boolean,
): ResultadoEnvio {
  if (!conta.acoes.includes('executar_sync_omie')) {
    return {
      estado: 'negado',
      motivo:
        'Envio negado (403): ação executar_sync_omie revogada/ausente para o usuário — tentativa cancelada SEM POST; revalidação da concessão acontece imediatamente antes da chamada.',
    }
  }
  return enviarComAquisicao(t, payload, adapter, agora, leaseMs, temLease)
}

/**
 * O4: reinício — a tentativa em 'enviando'/'resultado_incerto' é tratada como
 * potencialmente enviada: SOMENTE consulta/reconciliação (delega a fila);
 * a consulta conclusiva confirma com o POST total que já existia (1);
 * a inconclusiva mantém incerto. Nunca autoriza novo POST.
 */
export function retomarAposReinicio(
  t: Transacao,
  consulta: { encontrou: boolean; quantidade: number | null },
): { estado: string; transacao: Transacao; novoPostAutorizado: false; postsTotais: number } {
  const r = reconciliarPorConsulta(t, consulta)
  return {
    estado: r.estado,
    transacao: r.transacao,
    novoPostAutorizado: false,
    postsTotais: t.posts_mutantes,
  }
}

export type ResultadoRetificar =
  | { estado: 'negado_409'; motivo: string }
  | { estado: 'invalidada'; motivo: string }
  | { estado: 'ok_sem_efeito'; motivo: string }

/**
 * O3: retificação vs envio — mesma guarda transacional da OP/revisão.
 * - Durante enviando/resultado_incerto (congelado): 409, hash da quantidade
 *   aprovada permanece, nada sobrescrito.
 * - Antes da aquisição: payload divergente do hash aprovado → aprovação
 *   invalidada e zero POST da quantidade original.
 */
export function tentarRetificarDurante(
  t: Transacao,
  payloadNovo: unknown,
  hashAprovado: string,
): ResultadoRetificar {
  if (t.estado === 'enviando' || t.estado === 'resultado_incerto') {
    return {
      estado: 'negado_409',
      motivo: `Conflito (409): OP/consolidação congelada em ${t.estado} durante o envio — retificação recusada; hash da quantidade ${t.quantidade} permanece; recarregue e aguarde a reconciliação.`,
    }
  }
  if (JSON.stringify(payloadNovo) !== hashAprovado) {
    return {
      estado: 'invalidada',
      motivo:
        'Hash do payload divergente da aprovação vigente — aprovação invalidada; zero POST da quantidade original; nova aprovação só após falha_sem_efeito comprovada e payload revisado.',
    }
  }
  return {
    estado: 'ok_sem_efeito',
    motivo: 'Retificação compatível com o hash aprovado (nada enviado neste recorte de prova).',
  }
}

/**
 * Transversal: CRUD direto em transações/hashes aprovados é negado — inclusive
 * para perfis administrativos funcionais. Manutenção privilegiada exige
 * autorização, backup e registro de auditoria separados (não é mecanismo de
 * reprocessamento operacional).
 */
export function negarCrudDireto(
  operacao: 'PATCH' | 'DELETE' | 'PUT',
  recurso: string,
): { estado: 'negado_403'; motivo: string } {
  return {
    estado: 'negado_403',
    motivo: `Operação ${operacao} direta em ${recurso} negada (403): administração de perfis/configuração não concede edição ou exclusão de tentativas, hashes aprovados ou aprovações; manutenção excepcional exige autorização, backup e auditoria separados.`,
  }
}
