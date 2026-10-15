# BluxTrade

Plataforma de trading com Robux/Blux, dados de mercado em tempo real, gráficos de candles, operações Long/Short, alavancagem e pool de liquidez para stake.

## Funcionalidades

- Gráfico de candles com Lightweight Charts.
- Dados de preço e mercado da Binance.
- Intervalos de 1 minuto, 5 minutos, 15 minutos, 1 hora, 4 horas e 1 dia.
- Operações Long e Short.
- Alavancagem mínima de 1x e máxima dinâmica conforme a liquidez livre da pool, limitada a 50x.
- Carteira de depósitos e saques.
- Stake de Blux para fornecer liquidez.
- Verificação de conta Roblox.

## Desenvolvimento local

Requisitos: Node.js 22 ou superior e npm, pnpm ou Bun.

```sh
git clone <url-do-repositorio>
cd robux-future-trades
npm install
npm run dev
```

A aplicação usa variáveis de ambiente do Supabase para autenticação, leitura de dados e funções financeiras. Consulte os arquivos de integração em `src/integrations/supabase/` antes de configurar um ambiente de produção.

## Validação

```sh
npm run lint
npm run test
npm run build
```
