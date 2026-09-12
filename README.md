# ⛩️ Meus Animes • Catálogo & Tracker Pessoal (Estilo Notion)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript%20ES6+-F7DF1E?logo=javascript&logoColor=black)](js/app.js)
[![CSS3](https://img.shields.io/badge/CSS3-Modern%20Design-1572B6?logo=css3&logoColor=white)](css/)
[![Offline First](https://img.shields.io/badge/Storage-LocalStorage%20Offline-success)](js/storage.js)

Aplicação web pessoal para gerenciamento, acompanhamento e registro de animes com estética **clean e minimalista inspirada no Notion** (Dark Mode suave, propriedades organizadas, visualizações em Galeria, Tabela e Aba de Lançamentos Recentes por Temporada).

Funciona **100% no seu navegador (armazenamento local via LocalStorage)**, sem anúncios, sem rastreadores, sem necessidade de login ou dependência de servidores na nuvem.

---

## ✨ Funcionalidades Principais

### 1. 🔍 Busca Inteligente e Autocompletação de Animes
- Digite o nome de qualquer anime (ex: *Frieren, Solo Leveling, Jujutsu Kaisen, Attack on Titan*) para autocompletar via API aberta da Kitsu / Jikan.
- Importa com 1 clique: pôster em alta resolução, banner, títulos oficial e japonês, temporadas (*Outono, Primavera, etc.*), ano de estreia, número total de episódios, gêneros, estúdio e sinopse.
- Suporte a cadastro e edição 100% manual se preferir.

### 2. ⚡ Explorador de Lançamentos Recentes (Temporadas & Anos)
- Aba dedicada **"⚡ Lançamentos Recentes"** para descobrir o que está em alta no Japão.
- Filtros por **Ano** (2020 a 2026+) e por **Temporada** (*Inverno, Primavera, Verão, Outono* ou *Todas as Temporadas do Ano*).
- Adicione animes diretamente do catálogo de novidades para a sua lista com um clique no botão **"+ Adicionar à Minha Lista"**.

### 3. 🎬 Controle Avançado de Episódios (Modo Duplo)
- **Modo Grade Compacta (Grid)**: Botões numéricos rápidos para cada episódio.
  - Clique simples para alternar o status do episódio (assistido/não assistido).
  - Menu contextual ou atalhos para marcar todos os episódios até aquele ponto com 1 clique.
- **Modo Lista Detalhada (Notion)**:
  - Campo de anotações individuais por episódio (ótimo para registrar teorias, lutas marcantes, minutos e impressões).
  - Salva em tempo real enquanto você digita.

### 4. 🔗 Central de Links Úteis por Anime
- Adicione links rápidos para cada anime (ex: página na Crunchyroll, Netflix, MyAnimeList, fórum Reddit ou pasta local).

### 5. 🗂️ Visualizações Alternáveis
- **Galeria Visual**: Cartões modernos com pôster, progresso em barra percentual, nota e botão rápido de avanço `+1 Ep`.
- **Tabela / Database Notion**: Linhas compactas com colunas clicáveis, controles de incremento rápido (`-` e `+`) e tags coloridas.

### 6. 🏷️ Filtros, Tags e Ordenação
- Filtro por abas de status: *Todos, Assistindo, Planejo Ver, Completos, Pausados, Dropados e ★ Favoritos*.
- Busca textual instantânea por título, título nativo ou gênero.
- Ordenação por: *Mais Recentes, Maior Nota, Ordem Alfabética e Mais Episódios Vistos*.

### 7. 💾 Privacidade Total & Backup / Restauração
- Seus dados pertencem a você: salvos localmente no `localStorage` do seu navegador.
- **Exportar Backup**: Baixe um arquivo `.json` completo contendo sua lista, links e comentários de episódios.
- **Importar Backup**: Restaure ou migre sua lista inteira em qualquer navegador ou computador a qualquer momento.

---

## 🚀 Como Executar Localmente

Por utilizar **JavaScript ES Modules** (`import`/`export`), navegadores modernos exigem que a aplicação seja servida por um servidor web local simples:

### Opção 1: Usando `npx serve` (Recomendado com Node.js)
No terminal da pasta do projeto, execute:
```bash
npx serve .
```
E abra o endereço indicado (ex: `http://localhost:3000`).

### Opção 2: Usando Python 3
```bash
python -m http.server 8080
```
E acesse `http://localhost:8080`.

### Opção 3: Extensão Live Server (VS Code / Antigravity)
Basta clicar com o botão direito no arquivo `index.html` e selecionar **"Open with Live Server"**.

---

## 🛠️ Tecnologias Utilizadas

- **HTML5 Semântico**: Estrutura acessível e moderna.
- **CSS3 Puro**: Variáveis customizadas (design tokens estilo Notion Dark `#191919`, microinterações, glassmorphism e responsividade total).
- **JavaScript Moderno (ES6+)**: Modularizado, sem bibliotecas pesadas ou frameworks complexos.
- **APIs**: [Kitsu API](https://kitsu.docs.apiary.io/) e fallback para [Jikan (Unofficial MyAnimeList API)](https://jikan.moe/).

---

## 📄 Licença

Este projeto está licenciado sob os termos da licença **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

Desenvolvido por [EduardoEricDev](https://github.com/EduardoEricDev).
