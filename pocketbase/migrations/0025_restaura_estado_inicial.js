// pocketbase/migrations/0025_restaura_estado_inicial.js — Plano B, passo final (14/10)
// Apos a prova A/B/C na conta da Keoma (troca -> recusa da inicial -> entrada com a nova),
// restaura o estado limpo para o teste humano: TODAS as 21 contas voltam a ter a senha
// inicial do cofre e primeira_senha_trocada=false. A senha temporaria da prova deixa de valer.
// Down: sem operacao — hashes de senha anteriores nao sao recuperaveis por design.
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
    for (const c of contas) {
      let rec = null
      try {
        rec = app.findAuthRecordByEmail('_pb_users_auth_', c + '@mccfranchising.com.br')
      } catch (_) {
        continue
      }
      rec.setPassword(senhaInicial)
      rec.set('primeira_senha_trocada', false)
      app.save(rec)
      resetadas += 1
    }
    console.log('0025: resetadas=' + resetadas)
  },
  () => {},
)
