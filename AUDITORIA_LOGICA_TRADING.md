# Auditoria da lógica de trading — Bluxq

Data: 05/11/2026

## Escopo e modelo encontrado

Esta revisão cobriu a abertura e o fechamento de posições, PnL, alavancagem, preços usados pela interface, liquidações automáticas, reservas de `market_pools`, taxas de abertura e fechamento, stakes e os gatilhos de copy trading relacionados a posições. Comparei também as definições locais com as funções implantadas no Supabase em modo somente leitura. Nenhum saldo, registro financeiro ou função de produção foi alterado durante a inspeção.

O Bluxq não abre ordens em contas Binance, Bybit ou OKX e não implementa seus mecanismos específicos de margem. Ele mantém posições internas isoladas por operação e usa preços de mercado obtidos por provedores externos. Portanto, os cálculos abaixo descrevem o modelo próprio do Bluxq; não devem ser apresentados como regras de liquidação de uma exchange real.

## Regras internas preservadas

Para margem `M`, alavancagem `L`, preço de entrada `E` e saída `X`, o tamanho nominal é `M × L`, e a quantidade é `(M × L) / E`. O PnL bruto é `quantidade × (X − E)` para long e `quantidade × (E − X)` para short. O modelo limita a perda a `−M` e o lucro a `5 × M`.

O gatilho de liquidação permanece em perda de 90% da margem: `E × (1 − 0,9/L)` para long e `E × (1 + 0,9/L)` para short. Assim, por exemplo, com entrada 100 e leverage 10x, o gatilho é 91 no long e 109 no short. Esse limite é um buffer próprio do produto, não uma taxa de manutenção de uma exchange.

A taxa de abertura continua em 10% da margem. A taxa de fechamento continua em 10% somente do lucro realizado; 70% dessa taxa vai para stakers e o restante para a plataforma. A taxa de abertura tem uma divisão diferente: 40% para a pool de stakers quando há cotistas, 10% para afiliado quando aplicável e o restante para a plataforma. O limite atual de reserva da pool — dívida simulada mais lucro máximo — continua sendo `M × (L + 4)`. Não alterei alavancagem máxima, limite de lucro, percentuais comerciais, stakes ou orçamento de copy trading.

## Correções implementadas no repositório

A rotina antiga declarava liquidação quando a perda chegava a 90% da margem, mas registrava PnL de `−100%` e payout zero mesmo se a cotação de saída estivesse exatamente no limite. Isso transformava o buffer de 10% em uma penalidade extra não declarada. A nova migration calcula a perda pelo preço de saída efetivo, limita-a à margem isolada e devolve o saldo que ainda existir. Se o preço saltar além do ponto de perda total, o payout permanece zero. A pool recebe a perda efetivamente realizada e a reserva da posição é liberada na mesma transação.

A interface agora usa helpers comuns para estimar taxa de abertura, PnL e preço de liquidação; entradas inválidas ou preço zero não geram PnL inventado. Cotação de gráfico expira após 20 segundos e ticker após 30 segundos. Quando falta cotação recente, o PnL da posição aparece como indisponível e o agregado é marcado como parcial; a abertura da ordem fica bloqueada sem preço fresco.

A sincronização de liquidações passou a percorrer páginas estáveis de até 500 posições em vez de parar na primeira página, e falhas de RPC de fechamento são registradas. Falhas de leitura da pool ou das posições também deixam de ser silenciosamente tratadas como liquidez zero ou lista vazia.

## Contabilidade examinada

A margem da posição é debitada do saldo no momento da abertura e mantida como colateral da própria posição; ela não é parte dos ativos livres da `market_pool`. Por isso, no fechamento normal, devolver a margem não deve reduzir novamente os ativos da pool. O PnL, as taxas retidas e as parcelas de receita precisam ser avaliados em conjunto. Mantive essa convenção do produto e não apliquei a mudança sugerida por uma leitura que tratava a margem como ativo já depositado na pool.

A reserva da pool calculada no SQL coincide com a estimativa da interface. As operações de stake por mercado verificam a liquidez livre antes do saque; copy trading usa orçamento como limite de alocação, não como saldo bloqueado. Essa última escolha pode resultar em cópias puladas se o usuário gastar o saldo depois de ativar a alocação; não alterei essa semântica.

## Riscos que ainda precisam de decisão operacional

1. A liquidação automática não tem um worker contínuo próprio: é chamada pela sincronização da tela de trade (a cada 15 segundos enquanto um usuário autenticado mantém essa tela aberta) e antes de novas aberturas. Se ninguém estiver usando a tela e não houver novas ordens, a posição pode não ser processada imediatamente. Para liquidação independente de usuários conectados, ainda é necessário instalar e monitorar um agendador/worker confiável.
2. O caminho de preço pode usar fontes/produtos diferentes (Binance spot, Binance futures ou fallback CoinGecko). A resposta usada na lógica atual não guarda fonte e timestamp, nem rejeita divergência entre fontes. Isso é aceitável apenas como premissa explícita de uma simulação; não é um oráculo de execução apropriado para prometer liquidação fiel a uma exchange.
3. Para suportar Binance Futures, Bybit, OKX ou outras exchanges de forma específica, será necessário definir por mercado o tipo de contrato, preço de referência (mark/index/last), margem isolada ou cruzada, tiers de manutenção, taxas de fechamento/liquidação e funding. O seletor e os dados de integração não existem hoje no projeto.
4. O copy trading espelha a posição pelo preço de entrada do líder. Isso elimina slippage no simulador e pode divergir do preço que um executor real conseguiria; não foi mudado sem uma política de execução definida.

## Validação e publicação

Foram adicionados testes de matemática para long/short em 1x, 10x e 50x, limites de PnL, entradas inválidas, taxa arredondada e buffer de liquidação. Resultado local: 13 testes passaram; ESLint nos arquivos alterados, `tsc --noEmit` e build Vite também passaram.

A migration `0020_settle_liquidation_at_exit_price.sql` está pronta no repositório, mas **não foi aplicada ao Supabase de produção**. A atualização muda o valor devolvido em liquidações futuras e precisa ser implantada de forma controlada; os dados e saldos históricos não foram reconciliados. As alterações também não foram enviadas ao GitHub.
