# Painel de Tasks de Compra

Mostra quantas tasks de compra do BEES Force (Desenvolvimento de Portfólio — Cerveja, LN, LN High End, NAB, Match,
SKU PDV —, Marketplace e Volume) cada setor de **Patos, Sumé, Guarabira, Sousa, Itaporanga, Brumado, Barra da
Estiva e Caculé** fez, em dois painéis:

- **Vespertina · pedidos do dia** — o fechamento da tarde: quais tarefas os pedidos digitados hoje fecharam.
- **Mês · faturado** — tarefas concluídas no mês: validadas no BEES + as que o faturado/entregue já cobre.

O analista roda o fechamento no VS Code e publica. RNs e GVs abrem um link, fazem login com o e-mail e veem
o resultado, com histórico dos fechamentos anteriores.

```
 entrada/  pedidos do dia (Cora) · faturados do mês (Promax) · tarefas BEES (1 por revenda) · cesta
        │  npm run fechamento      ← motor de regras (TypeScript, testado)
        ▼
 public/data/dias/AAAA-MM-DD.json   + um arquivo por setor (detalhe dos PDVs)
 public/data/meses/AAAA-MM.json     + um arquivo por setor
        │  npm run publicar
        ▼
 Cloudflare Pages + Cloudflare Access  →  RNs e GVs (login por e-mail)
```

## Ferramentas

| Ferramenta | Para quê | Custo |
| --- | --- | --- |
| [VS Code](https://code.visualstudio.com/) | Editar, rodar o fechamento pelo menu de tarefas | Grátis |
| [Node.js 22 LTS](https://nodejs.org/) | Executa o fechamento e gera o site | Grátis |
| [Git](https://git-scm.com/) + GitHub (repositório privado) | Histórico das mudanças nas regras | Grátis |
| TypeScript + Vite + Vitest | Linguagem, empacotador do site e testes | Grátis (já vêm no `npm install`) |
| SheetJS (`xlsx`) | Lê o .csv de pedidos e os .xlsx de tarefas e cesta | Grátis |
| [Cloudflare Pages](https://pages.cloudflare.com/) | Hospeda o painel (link fixo, HTTPS) | Grátis |
| [Cloudflare Access](https://www.cloudflare.com/zero-trust/products/access/) | Login por e-mail: só quem está na lista entra | Grátis até 50 usuários |

## Instalação (uma vez)

1. Instale **Node.js 22 LTS**, **Git** e **VS Code**.
2. Descompacte este projeto numa pasta (ex.: `C:\Projetos\painel-tasks-compra`).
3. No VS Code: **Arquivo → Abrir Pasta…** e escolha a pasta. Aceite instalar as extensões recomendadas.
4. Abra o terminal (**Terminal → Novo Terminal**) e rode:
   ```bash
   npm install
   npm run verificar
   ```
   O segundo comando confere os tipos e roda os testes. Tem que terminar com tudo verde.
5. Crie o repositório Git (guarda o histórico das regras):
   ```bash
   git init
   git add .
   git commit -m "Primeira versão do painel"
   ```
   Opcional: publique num repositório **privado** no GitHub (botão "Publish to GitHub" do VS Code).

## Publicação na internet (uma vez)

1. Crie uma conta grátis em <https://dash.cloudflare.com/sign-up>.
2. No terminal do VS Code:
   ```bash
   npx wrangler login
   npx wrangler pages project create painel-tasks-compra --production-branch main
   npm run publicar
   ```
   No fim aparece o link, algo como `https://painel-tasks-compra.pages.dev`.
3. Feche o acesso com login (Cloudflare Access):
   - No painel da Cloudflare: **Zero Trust** (escolha o plano Free) → **Access → Applications → Add an application → Self-hosted**.
   - Domínio: `painel-tasks-compra.pages.dev` (e também `*.painel-tasks-compra.pages.dev`, que cobre as prévias).
   - Política **Allow** com **Emails**: os e-mails dos RNs, GVs e analistas. Ou **Emails ending in** `@suaempresa.com.br`.
   - Método de login: **One-time PIN** (a pessoa recebe um código no e-mail; não precisa criar senha).
4. Teste numa aba anônima: o site deve pedir o e-mail antes de mostrar qualquer número.

> Os arquivos brutos (pedidos, tarefas, cesta) **nunca** vão para o site nem para o Git. Só o resultado
> calculado em `public/data` é publicado.

## Rotina do fechamento (todo dia)

Pelo menu **Terminal → Executar Tarefa…** do VS Code (ou `Ctrl+Shift+B` para a primeira):

| Passo | Tarefa do VS Code | Comando equivalente |
| --- | --- | --- |
| 1. Copie os exports para a pasta `entrada/` (veja `entrada/LEIA-ME.md`) | — | — |
| 2. Gere o fechamento | **1. Fechamento (vespertina + mês)** | `npm run fechamento` |
| 3. Confira no seu computador | **2. Ver painel no meu computador** | `npm run dev` → <http://localhost:5173> |
| 4. Publique | **3. Publicar para RNs e GVs** | `npm run publicar` |

O fechamento usa o dia mais recente do arquivo de pedidos e o mês mais recente do faturado. Leva cerca de
1 minuto (o faturado tem centenas de MB). Opções:

```bash
npm run fechamento -- --dia 2026-11-04      # refaz a vespertina de outro dia
npm run fechamento -- --so-dia              # só a vespertina
npm run fechamento -- --so-mes              # só o painel do mês
npm run fechamento -- --sem-bloqueados      # não conta pedidos bloqueados
```

Os `.csv` são reconhecidos pelo **cabeçalho**, não pelo nome: pode chamar o arquivo do jeito que quiser
(`Pedidos_Cora.csv`, `03.02.37.csv`…).

O terminal mostra o resumo (feitas por revenda e por indicador) e avisa quando:
- um produto do pedido não está na cesta (cesta desatualizada);
- aparece um texto de tarefa novo que nenhuma regra reconhece.

**Aferição com o BEES.** No painel do mês, o terminal mostra quanto das tarefas que o BEES já validou o motor
também reconhece pelo faturado, por indicador (ex.: `Cerveja 99,4% · NAB 99,5% …`). É o termômetro das regras:
se um indicador ficar abaixo de 95% (aparece em amarelo), surgiu nomenclatura nova — ajuste `regras.ts`.

A cesta só precisa ir para `entrada/` quando mudar: a última usada fica guardada em `base/`.

## Como RNs e GVs usam

- Abrem o link e entram com o e-mail (código de acesso chega na caixa de entrada).
- Escolhem o painel (Vespertina ou Mês), o fechamento, a revenda, o GV, o indicador ou buscam pelo setor/nome do NB.
- Clicam no setor para ver cada PDV que comprou, as tarefas feitas, parciais e não feitas, e os itens do pedido
  que fecharam cada uma.
- **Copiar link do setor** gera um link que já abre no setor: dá para mandar no WhatsApp de cada RN.
- **Baixar CSV** / **Copiar tabela** levam a tabela para o Excel.

## Estrutura do código

```
src/
  engine/            Motor de regras (não depende de navegador nem de planilha)
    regras.ts          ← TABELAS DE EQUIVALÊNCIA: marcas, embalagens, grupos, fornecedores
    avaliar.ts         cruza tarefas x pedidos (dia) ou notas (mês) e define Feita / Parcial / Não feita
    leitura.ts         converte as linhas dos exports nos tipos do motor
    publicacao.ts      monta o JSON publicado
  pipeline/          Rotina de fechamento (Node)
    config.ts          ← REVENDAS (UNB ↔ filial do Promax), status/operações do faturado, histórico
    fechamento.ts      npm run fechamento
  shared/modelo.ts   Formato do JSON publicado (contrato entre fechamento e painel)
  app/               Painel web (lê public/data)
tests/               Testes (Vitest)
entrada/             Exports do dia (fora do Git)
public/data/         Fechamentos publicados
public/marca/        Logos do painel (Pau Brasil e Ambev), já reduzidos para a web
marca-originais/     Arquivos originais dos logos, em alta resolução (não vão para o site)
```

Para trocar um logo, substitua o arquivo em `public/marca/` mantendo o nome (`pau-brasil.png` ou `ambev.png`).
Use PNG com fundo transparente: ele aparece numa placa branca no cabeçalho.

## Como mudar uma regra

Exemplo: o BEES passou a usar a tarefa "cobertura de 1 caixa(s) de SPATEN LATA 269".

1. Em `src/engine/regras.ts`, na tabela `EMBALAGENS`, acrescente:
   ```ts
   ['LATA 269', (d) => ehLata(d) && /\b269 ?ML/.test(d)],
   ```
2. Em `tests/regras.test.ts`, acrescente um caso com o texto da tarefa e um produto que deve bater.
3. Rode `npm test`. Verde → `git commit` → `npm run fechamento` → `npm run publicar`.

O teste `tests/fechamento-real.test.ts` refaz um fechamento antigo quando os arquivos originais estão em
`tests/referencia/`. Atenção: os números de referência (04/11, só Patos/Sumé) são da regra antiga, que não
filtrava tarefa diária pelo dia da visita; se você colocar arquivos lá, atualize os números esperados.

## Nova revenda ou filial

Em `src/pipeline/config.ts`, na lista `REVENDAS`, acrescente `{ unb, nome, filial }`:
- `unb` = coluna "Unb" das tarefas (e "Cód. unidade venda" dos pedidos do dia);
- `filial` = "Empresa/Filial" da revenda no export de faturados do Promax (ex.: `064/0001`).

Unidades que aparecem nos pedidos sem estar em `REVENDAS` são ignoradas e listadas no terminal.

## Regras de negócio

- **Escopo:** Desenvolvimento de Portfólio (Cerveja, LN, LN High End, NAB, Match, SKU PDV, Marketplace, Outras),
  Marketplace e Volume.
- **SKU PDV:** só as tarefas "N SKUs distintos de CERVEJA / NAB / MARKETPLACE / MATCH" (de Portfólio ou
  Marketplace). Outros "SKUs distintos" (H2OH, RGB, Minalba…) ficam no indicador da categoria.
- **LN:** tarefas de Portfólio com "Long Neck" ou "LN" no texto.
- **LN High End:** LN de Corona (Extra e Cero/Zero), Michelob, Stella e Stella Pure Gold, ou do grupo HE/Premium.
  Na validação pelo produto, Spaten só conta quando o texto da tarefa cita Spaten.

**Vespertina (dia)**
- **Pedidos que contam:** venda, bonificação e itens de resgate, com entrada no dia do fechamento; trocas,
  cancelados e rejeitados ficam de fora; bloqueados contam (ajustável em `config.ts`).
- **Tarefa diária:** só entra se a visita for no dia do fechamento.
- **Tarefa mensal:** faturado do mês (pedidos capturados antes do dia) + pedido do dia ≥ meta → "Feita no dia".
  Se o faturado sozinho já batia a meta → "Já concluída". Sem arquivo de faturado, desconta a "QTD Já Comprada".
- **Tarefa validada pelo BEES no dia ou depois** (a planilha costuma ser exportada no dia seguinte): se o pedido do
  dia a fecha, conta como "Feita no dia"; senão, "Já concluída".

**Mês (faturado)**
- **Notas que contam:** operação 1 (venda) e 2 (bonificação), com **data de entrega** (coluna "Emissao") no mês das
  tarefas. Devolvidas (D) e canceladas (C) nunca contam; operações 5, 9, 108 e outras também não.
- **Concluída:** validada no BEES, ou faturado do mês ≥ meta cheia da tarefa (mensal ou diária: vale qualquer
  entrega no mês, como o BEES valida).
- **% de conclusão:** concluídas ÷ todas as tarefas verificáveis do setor.
- O produto é reconhecido pelo código na cesta (a descrição do Promax vem cortada em 20 letras).

**Para os dois**
- **Parcial:** comprou o alvo, mas não o suficiente.
- **Não verificável:** [PROATIVA] e [VALE MAIS PONTOS] (dependem de histórico de compra).
- **"Qualquer…":** tarefas "cobertura de CERVEJA / NAB / MATCH / MARKETPLACE", "qualquer SKU de <indústria>"
  (Água, Mondelez, Diageo, Pernod, Ypê, Pitu, Cia Muller, Minalba, É Leve, Dias D'Ávila) e "qualquer produto"
  validam com **qualquer item** da cesta/fornecedor citado.
- **Nome exato do produto** na tarefa (ex.: "STELLA ARTOIS PURE GOLD LONG NECK 330ML SP SH C/4"): compara direto
  com a descrição do produto.
- **Equivalências** (confirmadas nas tarefas que o BEES validou): CERVEJA = cesta "Cerveja S/Match";
  "LATA 350" aceita lata comum e multipack ("… LATA 350 MULTPACK" exige multipack); Guaraná Antarctica normal
  aceita também Zero/Diet (Zero aceita "DIET", mas não o normal); Pepsi Black = Pepsi Zero; Inteira = garrafa
  600 ml (retornável ou one way); Long neck inclui one way pequena ("BUDWEISER OW 330ML"); Litrinho = 300 ml
  retornável; LN Pack = qualquer SKU das marcas citadas.
- **Já validadas** no export do BEES aparecem à parte e não são contadas de novo.

É uma prévia de fechamento: a validação oficial do BEES acontece após o faturamento.
