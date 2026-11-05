# Manual do Imóvel Sustentável — site

Site da cartilha "Manual do Imóvel Sustentável" (Atividade Extensionista II — Arquitetura e Urbanismo, FUMEC).

## Como abrir
- Dê dois cliques em `index.html` (abre no navegador), **ou**
- No VS Code, clique com o botão direito em `index.html` → "Open with Live Server" (recomendado para apresentar).

É preciso internet para: fontes, mapa de satélite, busca de cidades, qualidade do ar e mapa do Windy.

## Estrutura
- `index.html` — todas as seções (cartilha + check-lista)
- `css/style.css` — visual (cores e fontes em `:root`)
- `js/main.js` — menu, checklists (salvos no navegador), abas, local compartilhado, gráfico de valor
- `js/sol.js` — Sol & Terra: mapa de satélite, trajetória solar, análise da fachada, links SunCalc/Google Earth
- `js/energia.js` — simulador de consumo e energia solar (link Axia)
- `js/ar.js` — qualidade do ar (Open-Meteo/CAMS) + mapa Windy
- `vendor/` — Leaflet 1.9.4 e SunCalc 1.9.0 (cópias locais)
