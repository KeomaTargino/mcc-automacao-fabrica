// pocketbase/migrations/0019_usuarios_reais_matriz.js — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Cria as 21 contas reais da matriz nominal v1.2 + perfis EXATOS (areas/acoes/pontos).
// DECISOES DO APROVADOR aplicadas:
//   - dominio: @mccfranchising.com.br (formulario 14/10 12:48 BRT);
//   - senha inicial: gerada pelo executor, guardada APENAS no secret PCP_INITIAL_PASSWORDS
//     (nunca em repo/chat); troca obrigatoria no 1o login (hook pcp_primeira_senha);
//   - contas criadas com ativo=FALSE — ativacao real so apos o teste humano;
//   - sem acesso na v1: Limpeza (Hellene) e Motorista (Renato) — nenhuma conta criada;
//   - Ronaldo: espelho dos gerentes (areas uniao, acoes uniao, sem editar_parametros);
//   - Keoma: pontos vazios (pendencia registrada na matriz v1.2);
//   - Renato: conta reservada NAO criada (sem escopo na v1).
// Idempotente: conta existente mantida (sem sobrescrever senha/perfil de quem ja mudou).
// Perfis sinteticos @pcp.local NAO sao tocados aqui (revogacao vem depois das provas).
migrate(
  (app) => {
    const senhaInicial = $secrets.get('PCP_INITIAL_PASSWORDS')
    if (!senhaInicial || senhaInicial.length < 12) {
      throw new Error('PCP_INITIAL_PASSWORDS ausente ou curta (min 12)')
    }
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const perfisCol = app.findCollectionByNameOrId('pcp_perfis')

    const A = {
      consultar_planejamento: true,
      editar_programacao: true,
      editar_parametros: true,
      publicar_programacao: true,
      apontar_producao: true,
      conferir_expedicao: true,
      conferir_camara: true,
      aprovar_consolidacao: true,
      executar_sync_omie: true,
    }
    const pessoas = [
      {
        nome: 'Arivaldo Missias Caboronga',
        conta: 'arivaldo.missias',
        areas: ['producao', 'painel'],
        acoes: ['consultar_planejamento', 'apontar_producao'],
        pontos: ['cozinha', 'encaixotamento'],
      },
      {
        nome: 'Adelma Cezar Alves',
        conta: 'adelma.cezar',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['cozinha'],
      },
      {
        nome: 'Antonio Carlos de Souza Junior',
        conta: 'antonio.carlos',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['cozinha'],
      },
      {
        nome: 'Caua Silva Reis',
        conta: 'caua.silva',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['cozinha'],
      },
      {
        nome: 'Daniel Venancio Pires',
        conta: 'daniel.venancio',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['cozinha'],
      },
      {
        nome: 'Margarida da Silva Mattos',
        conta: 'margarida.silva',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['cozinha'],
      },
      {
        nome: 'Maria Marleide Pereira da Silva',
        conta: 'maria.marleide',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['cozinha'],
      },
      {
        nome: 'Paulo Shiroma',
        conta: 'paulo.shiroma',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['cozinha'],
      },
      {
        nome: 'Regivaldo Silva Reis',
        conta: 'regivaldo.silva',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['cozinha'],
      },
      {
        nome: 'Roberto Lopes dos Santos',
        conta: 'roberto.lopes',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['cozinha'],
      },
      {
        nome: 'Josiane Salvadora de Santana',
        conta: 'josiane.santana',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['cozinha'],
      },
      {
        nome: 'Jhonas Weverton da Silva',
        conta: 'jhonas.silva',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['triagem'],
      },
      {
        nome: 'Uillson Cafe dos Santos',
        conta: 'uillson.santos',
        areas: ['producao'],
        acoes: ['apontar_producao'],
        pontos: ['encaixotamento'],
      },
      {
        nome: 'Ronaldo Silva Reis',
        conta: 'ronaldo.silva',
        areas: ['producao', 'compras', 'painel'],
        acoes: [
          'consultar_planejamento',
          'apontar_producao',
          'editar_programacao',
          'publicar_programacao',
          'aprovar_consolidacao',
          'executar_sync_omie',
        ],
        pontos: ['cozinha', 'encaixotamento', 'expedicao'],
      },
      {
        nome: 'Keoma Targino',
        conta: 'keoma.targino',
        areas: ['catalogo', 'estoque', 'pedidos', 'compras', 'producao', 'painel'],
        acoes: [
          'consultar_planejamento',
          'editar_programacao',
          'editar_parametros',
          'publicar_programacao',
          'aprovar_consolidacao',
          'executar_sync_omie',
        ],
        pontos: [],
      },
      {
        nome: 'Aleksandro Pereira Ramos',
        conta: 'aleksandro.ramos',
        areas: ['compras', 'painel'],
        acoes: [],
        pontos: [],
      },
      {
        nome: 'Alline de Paiva Perrupato',
        conta: 'alline.perrupato',
        areas: ['pedidos', 'producao', 'painel'],
        acoes: ['consultar_planejamento', 'editar_programacao'],
        pontos: [],
      },
      {
        nome: 'Angela Maria da Silva',
        conta: 'angela.silva',
        areas: ['pedidos', 'painel'],
        acoes: ['conferir_expedicao', 'conferir_camara'],
        pontos: ['expedicao', 'camara_fria'],
      },
      {
        nome: 'Cristiano Honorio de Almeida',
        conta: 'cristiano.almeida',
        areas: ['pedidos', 'painel'],
        acoes: ['conferir_expedicao', 'conferir_camara'],
        pontos: ['expedicao', 'camara_fria'],
      },
      {
        nome: 'Kevin Herlan Mamani Gonzales',
        conta: 'kevin.gonzales',
        areas: ['pedidos', 'painel'],
        acoes: ['conferir_expedicao', 'conferir_camara'],
        pontos: ['expedicao', 'camara_fria'],
      },
      {
        nome: 'Patricia Mellazo',
        conta: 'patricia.mellazo',
        areas: ['catalogo'],
        acoes: [],
        pontos: [],
      },
    ]

    let criadas = 0
    let existentes = 0
    for (const p of pessoas) {
      const email = p.conta + '@mccfranchising.com.br'
      let rec = null
      try {
        rec = app.findAuthRecordByEmail('_pb_users_auth_', email)
        existentes += 1
      } catch (_) {
        rec = new Record(users)
        rec.setEmail(email)
        rec.setPassword(senhaInicial)
        rec.setVerified(true)
        rec.set('name', p.nome)
        app.save(rec)
        criadas += 1
      }
      // perfil: so cria se a conta foi recem-criada (existente = ja provisionada antes, nao mexe)
      let perfil = null
      try {
        perfil = app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: rec.id })
      } catch (_) {}
      if (!perfil) {
        perfil = new Record(perfisCol)
        perfil.set('usuario', rec.id)
        perfil.set('ativo', false) // ativacao real so apos o teste humano
        perfil.set('areas', p.areas)
        perfil.set('pode_atualizar_fontes', p.acoes.indexOf('executar_sync_omie') !== -1)
        perfil.set('acoes', p.acoes)
        perfil.set('pontos', p.pontos)
        app.save(perfil)
      }
    }
    console.log('0019: contas criadas=' + criadas + ' existentes=' + existentes)
  },
  (app) => {
    const emails = [
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
    for (const c of emails) {
      try {
        const rec = app.findAuthRecordByEmail('_pb_users_auth_', c + '@mccfranchising.com.br')
        let perfil = null
        try {
          perfil = app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: rec.id })
          app.delete(perfil)
        } catch (_) {}
        app.delete(rec)
      } catch (_) {}
    }
  },
)
