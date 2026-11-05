# Incidente: falha ao carregar rota Stake

Data do diagnóstico: 05/11/2026.

## Evidência

O Console enviado pelo usuário mostra repetidamente:

`TypeError: Failed to fetch dynamically imported module: https://bluxtrade.vercel.app/assets/stake-djBvbDPA.js`

Fonte: console do navegador do usuário, mensagem enviada em 05/11/2026.

Ao conferir a publicação ativa em `https://bluxtrade.vercel.app/stake`, o HTML responde HTTP 200 com `cache-control: public, max-age=0, must-revalidate` e referencia `/assets/stake-djBvbDPA.js` como `modulepreload` do módulo lazy da rota `/stake`. O asset `https://bluxtrade.vercel.app/assets/stake-djBvbDPA.js` responde HTTP 200, `content-type: application/javascript; charset=utf-8`, `cache-control: public, max-age=31536000, immutable`, com 3.260 bytes. As respostas foram verificadas em 05/11/2026, aproximadamente 03:41 UTC.

A rota pública `/stake` e a rota pública `/stake/BTCUSDT` também foram abertas com sucesso em sessão anônima no navegador isolado. As consultas recentes da tabela `market_pools` retornaram HTTP 200 e a política de leitura de `market_pool_daily` permite SELECT para authenticated. Logs de erro do Supabase correspondentes não foram encontrados.

## Diagnóstico e mitigação

A mensagem é falha de importação dinâmica de um chunk, não erro na lógica de staking nem na consulta à pool. É consistente com uma aba que manteve em memória o manifesto JavaScript anterior durante uma troca de deployment: o módulo referenciado não estava disponível naquele instante. O asset está disponível na publicação verificada depois.

A tela de erro global foi ajustada para reconhecer erros de importação dinâmica e oferecer recarga completa da página, que busca o HTML/manifesto mais recente; erros de rota comuns continuam usando o retry do router. Não há Service Worker nem configuração de cache específica para esses arquivos no repositório.

## Limites

O erro original não pôde ser reproduzido depois que o asset voltou a responder HTTP 200, e não foi possível inspecionar a sessão autenticada do usuário. Portanto, a classificação como descompasso temporário entre aba e deployment é a explicação mais provável, não uma causa provada no instante da falha. Nenhuma operação de stake, retirada ou alteração do Supabase foi executada.
