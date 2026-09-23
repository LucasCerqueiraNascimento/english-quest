# English Quest — Picture Challenge v0.2

O logotipo CNA exibido na entrada do aluno foi obtido do site oficial
(`https://cna.com.br/wp-content/uploads/2024/08/logo-cna-idiomas-color.webp`).
Ele é um ativo da marca CNA; a identidade English Quest é separada.

Sistema de apoio às aulas de inglês para crianças, com turmas, aulas e o
primeiro jogo de associação entre imagens e palavras.

## Funcionalidades

- Conta administrativa com e-mail verificado e lista de acesso no servidor.
- Turmas, dias da semana, códigos, convites via link e QR Code, arquivamento.
- Autocadastro do aluno com primeiro nome, apelido e avatar; aprovação manual.
- Login com código, apelido e PIN de quatro dígitos, com limites persistentes.
- Redefinição do PIN, invalidação de sessões, bloqueio de alunos.
- Aulas em rascunho, agendadas, disponíveis, encerradas ou arquivadas.
- Área do aluno que mostra exclusivamente aulas disponíveis da sua turma.
- Picture Challenge editável por aula, com quatro opções por imagem, até três
  tentativas por aluno, recorde pessoal e relatórios de palavras difíceis.
- Contagens reais de cadastros, aulas e partidas. Sem dados fictícios no produto.
- Autorização de outros administradores por e-mail.

## Arquitetura

Next.js 16 + React 19 + TypeScript na Vercel. Supabase Auth para administradores;
Edge Function `school-api` para operações e autenticação de alunos; PostgreSQL
para registros persistentes. Todas as tabelas possuem RLS e nenhum acesso direto
para `anon`/`authenticated`. O backend valida a identidade em cada operação.
O modelo é uma única escola/workspace: administradores autorizados gerenciam
todas as turmas deste projeto, não um SaaS multi-escolas.

O navegador recebe apenas a URL e a chave **publishable**, que são públicas.
A chave privilegiada é usada somente no ambiente da Edge Function. Os avisos
informativos `rls_enabled_no_policy` são esperados: o acesso via Data API é
negado por padrão. Veja a orientação oficial:
https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

PINs usam PBKDF2-SHA256, salt aleatório, 210.000 iterações e segredo do backend.
A rotação desse segredo exige redefinir os PINs. Tokens de aluno têm 256 bits,
somente seu hash fica no banco e expiram em oito horas. O navegador usa
sessionStorage: sair encerra a sessão; em aparelhos compartilhados, sempre sair.
O aluno desativado ou de turma arquivada é bloqueado a cada requisição.

## Desenvolvimento

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev -- --hostname 127.0.0.1
```

Copie `.env.example` para `.env.local` se quiser apontar para outro projeto.
Nunca publique chaves secretas ou arquivos `.env.local` no GitHub.

## Banco e backend

`supabase/schema.sql` registra o schema inicial aplicado ao projeto dedicado.
Não reaplicar em banco existente. O histórico remoto da migração chama-se
`school_foundation`. A migração incremental do jogo está em
`supabase/migrations/20260923050000_picture_challenge.sql`.

No painel, salve uma aula, clique em **Criar jogo**, revise as imagens e as
quatro palavras de cada pergunta, salve e marque a aula como **Disponível**.
O modelo oferece doze ilustrações iniciais: oito cômodos e quatro móveis ou
objetos. Elas podem ser trocadas por imagens HTTPS. O aluno pode ouvir a
pergunta e cada opção em botões próprios. Tem até três palpites por imagem:
100, 70 ou 50 pontos
se acertar no primeiro, segundo ou terceiro palpite. Três acertos seguidos
valem mais 50 pontos; concluir a partida soma 100. Após três partidas, o
recorde permanece visível. As respostas são avaliadas dentro do banco em uma
transação; o cliente não recebe as respostas de perguntas ainda abertas.

`supabase/functions/school-api/index.ts` é a fonte completa do serviço publicado.
`verify_jwt=false` é intencional: a função implementa autenticação por ação.
Login/cadastro são públicos com validação e limite de tentativas; administração
exige JWT validado com `getUser`, e-mail confirmado e allowlist; aluno exige
token aleatório válido e consulta atualizada do cadastro. Não remover essas
verificações nem colocar a chave privilegiada no frontend.

## Primeiro acesso administrativo

1. A administração autoriza um e-mail em `staff_access` (primeiro e-mail já
   configurado durante a implantação; não fica no código público).
2. Abrir `/teacher/login` diretamente, escolher **Primeiro acesso** e definir senha.
3. Confirmar o e-mail e voltar ao login.
4. Em **Acessos**, autorizar o e-mail da professora, que faz o mesmo fluxo.

Antes do uso real, configurar no Supabase Auth o **Site URL** da publicação e
as **Redirect URLs** de `/teacher/login` para confirmação/recuperação de senha.
O provedor de e-mail padrão do Supabase tem restrições de destinatários e envio;
configurar SMTP próprio para professores que não pertencem à equipe Supabase.
Os alunos não dependem de e-mail ou SMTP.

## Publicação segura

- `main`: versão estável. Alterações em `foundation/*` ou `feature/*` passam por PR.
- `vercel.json`: define Next.js, `npm ci` e `npm run build`.
- Preview NÃO pode mutar o banco de produção: o cliente bloqueia operações
  quando detecta Vercel Preview com a configuração de produção. Isso é uma
  proteção contra acidentes, não uma fronteira de segurança.
- Para testes funcionais em Preview, configurar um Supabase de testes com schema
  e Edge Function equivalentes e ambas as variáveis públicas em Preview.
- O frontend inicial usa identificadores públicos de produção como fallback;
  nenhuma credencial secreta é necessária na Vercel nesta arquitetura.
- Novo conteúdo de aula não exige deploy. Novos tipos de jogo exigirão código,
  testes, publicação da função quando alterada, e deploy do frontend.
- Rollback da Vercel restaura APENAS frontend. Não reverte banco, dados ou Edge
  Functions. Alterações de schema devem ser compatíveis com a versão anterior.
- Não há backup automático configurado por este repositório. Planejar backup
  e retenção do banco antes de receber dados reais de crianças.
- A branch segue fluxo de PR; proteção obrigatória de branch ainda deve ser
  habilitada pelo proprietário quando disponível no plano do GitHub.

## Verificação

`npm test` verifica invariantes estáticas de segurança; não substitui testes reais.
`tests/flow.mjs` verifica autenticação, cadastro, aprovação, publicação, bloqueio,
reset de PIN e limites de tentativas contra o backend real usando uma conta QA
descartável. Executar SOMENTE com fixtures de teste e limpar depois:

```sh
TEST_EMAIL=... TEST_PASSWORD=... node tests/flow.mjs
```

Nenhum segredo de QA é versionado. O teste imprime somente os IDs das fixtures
para limpeza. Nunca executar com dados reais de alunos.

## Antes da primeira turma real

- Validar fluxo de confirmação e recuperação de e-mail no domínio final.
- Autorizar e testar o acesso da professora.
- Validar consentimento/comunicação aos responsáveis e prazo de retenção com a escola.
- Confirmar autorização da unidade antes de usar logo/nome CNA como marca do app.
- Verificar acesso público da Vercel: proteção de deployment pode exigir login
  na Vercel; não confundir essa proteção com o login do aplicativo.
- Preparar banco separado para testes e plano de backup de produção.

## Próxima etapa — jogos

Adicionar módulos versionados de atividades, questões, tentativas e respostas.
Preservar a fundação de turmas, alunos e acesso. Não atribuir pontos a dados de
cadastro. Só implementar pontuação após definir e testar as regras do jogo.
