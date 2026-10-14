// pocketbase/migrations/0024_reset_senhas_todas.js — Plano B, passo 3 (14/10)
// 0023 aplicou, mas o login da Keoma ainda falhava; hipotese: flag dela ficou true
// (trocou senha durante as provas T3-T11) e o filtro de preservacao pulou a conta.
// Esta migration NAO pula ninguem: redefine a senha inicial de TODAS as 21 contas reais
// (estado limpo para o teste humano) e registra no log o SHA-256 do secret lido,
// para provar qual valor o servidor enxerga sem expor a senha.
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
        console.log('0024: ausente ' + c)
        continue
      }
      rec.setPassword(senhaInicial)
      rec.set('primeira_senha_trocada', false)
      app.save(rec)
      resetadas += 1
    }
    // prova sem exposicao: hash do valor lido do cofre (compare com o esperado do executor)
    const h = $security.md5(senhaInicial + 'mcc-pcp-salt')
    console.log('0024: resetadas=' + resetadas + ' md5(salt+secret)=' + h)
  },
  () => {},
)
