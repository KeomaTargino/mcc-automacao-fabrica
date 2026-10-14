// pocketbase/migrations/0022_reset_senhas_iniciais.js — Plano B (14/10, pedido do owner)
// O dashboard nao exibia o valor do secret PCP_INITIAL_PASSWORDS ao owner; este ciclo
// grava um NOVO valor no secret e redefine a senha inicial das contas reais que AINDA
// NAO trocaram de senha (primeira_senha_trocada != true). Quem ja trocou (ex.: Angela,
// prova T11) e preservado — a senha dele(a) pertence só a ele(a).
// Regra mantida: senha inicial vive APENAS no secret; troca obrigatoria no 1o login.
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
    console.log('0022: resetadas=' + resetadas + ' preservadas(ja trocaram)=' + preservadas)
  },
  () => {},
)
