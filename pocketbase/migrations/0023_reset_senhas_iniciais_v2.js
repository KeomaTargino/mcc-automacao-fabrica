// pocketbase/migrations/0023_reset_senhas_iniciais_v2.js — Plano B corrigido (14/10)
// 0022 rodou com o valor ANTIGO do secret (o novo foi gravado por engano em env var,
// não no cofre de secrets); esta migration reexecuta o reset com o valor CORRETO agora
// gravado no cofre. Quem já trocou (primeira_senha_trocada=true) continua preservado.
// Down: sem operação — hashes de senha anteriores não são recuperáveis por design.
migrate(
  (app) => {
    const senhaInicial = $secrets.get('PCP_INITIAL_PASSWORDS')
    if (!senhaInicial || senhaInicial.length < 12) {
      throw new Error('PCP_INITIAL_PASSWORDS ausente ou curta (min 12)')
    }
    const contas = [
      'arivaldo.missias',
      'adelma.cezar',
      'antonio.carlos',
      'caua.silva',
      'daniel.venancio',
      'margarida.silva',
      'maria.marleide',
      'paulo.shiroma',
      'regivaldo.silva',
      'roberto.lopes',
      'josiane.santana',
      'jhonas.silva',
      'uillson.santos',
      'ronaldo.silva',
      'keoma.targino',
      'aleksandro.ramos',
      'alline.perrupato',
      'angela.silva',
      'cristiano.almeida',
      'kevin.gonzales',
      'patricia.mellazo',
    ]
    let resetadas = 0
    let preservadas = 0
    for (const c of contas) {
      let rec = null
      try {
        rec = app.findAuthRecordByEmail('_pb_users_auth_', c + '@mccfranchising.com.br')
      } catch (_) {
        continue
      }
      if (rec.get('primeira_senha_trocada') === true) {
        preservadas += 1
        continue
      }
      rec.setPassword(senhaInicial)
      rec.set('primeira_senha_trocada', false)
      app.save(rec)
      resetadas += 1
    }
    console.log('0023: resetadas=' + resetadas + ' preservadas(ja trocaram)=' + preservadas)
  },
  () => {},
)
