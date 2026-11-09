# TODO

- [ ] Cada stake deve registrar valor, moeda, data de início, prazo próprio e data de desbloqueio, sem misturar aportes diferentes do mesmo usuário.
- [ ] A tela deve mostrar quanto está travado, quanto tempo falta, valor atual e PnL em porcentagem para cada posição.
- [ ] O usuário só pode retirar uma posição individual depois do fim do prazo, e a retirada deve respeitar a liquidez livre da pool.
- [ ] Stakes já existentes devem continuar contabilizados e ser migrados sem apagar saldo; posições legadas ficam disponíveis imediatamente.
- [ ] Limites operacionais de valor e prazo, política de saque antecipado e critérios do ranking devem ficar configuráveis no banco.
- [x] Corrigir a consulta/organização do ranking para mostrar pódio dos 3 melhores ao lado da lista Top 10, com ranking semanal e identificadores anônimos.
- [x] Adicionar validade de 30 minutos aos depósitos, cancelamento somente após 60 segundos, contagem regressiva e persistência server-side da Creator API key.
- [x] Validar a Creator API key no Open Cloud e consultar a posse do Game Pass a cada 5 segundos até aprovar, expirar ou cancelar o depósito.
- [x] Rodar lint, testes e build; corrigir erros introduzidos antes de entregar.
- [x] Permitir ao admin cadastrar, editar e remover Game Passes com nome, ID, valor em Robux e estado ativo.
- [x] Mostrar somente Game Passes ativos na carteira de depósito e manter a Creator API Key fora do navegador.
- [x] Aplicar saque mínimo de 100, descontar 30% no saque Roblox e exibir bruto, taxa e líquido.
- [x] Separar visualmente depósito e saque, exigir depósito Roblox mínimo de 50 Robux e recomendar o Game Pass disponível mais próximo quando o valor informado não existir.
- [x] Salvar avatar oficial, nome e ID Roblox verificado e mostrar o avatar no painel administrativo.
- [x] Rodar lint, TypeScript e build de produção; não foram encontrados erros nos arquivos alterados.
