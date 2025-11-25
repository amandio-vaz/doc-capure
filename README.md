# 🧠 Cortex DeepMind - Gerador de Plano de Estudo IA

> Plataforma inteligente para criação de planos de estudo personalizados usando IA generativa

[![Vercel](https://img.shields.io/badge/vercel-deploy-black?logo=vercel)](https://vercel.com)
[![React](https://img.shields.io/badge/react-19.2.0-blue?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5.8.2-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Gemini](https://img.shields.io/badge/gemini-2.5-purple?logo=google)](https://ai.google.dev)

---

## 📖 Sobre o Projeto

**Cortex DeepMind** é uma aplicação web moderna que gera planos de estudo estruturados e personalizados para certificações profissionais e aprendizado autodidata, potencializada por modelos de IA avançados do Google Gemini.

### ✨ Funcionalidades Principais

- 📁 **Upload de Materiais:** Suporta PDF, DOCX, MD, HTML
- 🔗 **Import de URLs:** Extração automática de documentação online
- 🤖 **IA Generativa:** Gemini 2.5 Pro com busca na web integrada
- 🎯 **Planos Estruturados:** Hierarquia de capítulos e subcapítulos
- 🔊 **Text-to-Speech:** 5 vozes diferentes com controle de velocidade
- 📝 **Resumos Inteligentes:** Resumos automáticos por capítulo
- 🔍 **Busca Full-Text:** Highlighting e navegação entre resultados
- 💾 **Cache de Áudio:** IndexedDB para economia de API calls
- 📤 **Exportação:** Markdown, HTML e PDF
- ⌨️ **Atalhos de Teclado:** Navegação rápida e controles de áudio
- 🌙 **Dark Theme:** Interface moderna e responsiva

---

## 🏗️ Arquitetura

### Frontend
- **React 19.2.0** - Componentes funcionais com hooks
- **TypeScript 5.8.2** - Tipagem estrita
- **Vite 6.2.0** - Build ultrarrápido
- **Tailwind CSS** - Estilização utility-first

### Backend (Vercel Serverless Functions)
- **Node.js 20** - Runtime moderno
- **API Routes** - Endpoints seguros em `/api`
- **Rate Limiting** - Proteção contra abuso
- **CORS Validation** - Segurança de origem

### IA & APIs
- **Gemini 2.5 Pro** - Geração de planos (8K tokens)
- **Gemini 2.5 Flash** - Resumos rápidos (1K tokens)
- **Gemini Flash TTS** - Text-to-speech (24kHz)

---

## 🚀 Deploy Rápido

### Opção 1: Deploy na Vercel (Recomendado)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FVaz-Cortex%2Fcortex-4&env=GEMINI_API_KEY&envDescription=Chave%20da%20API%20do%20Google%20Gemini&envLink=https%3A%2F%2Faistudio.google.com%2Fapp%2Fapikey)

1. Clique no botão acima
2. Configure a variável `GEMINI_API_KEY`
3. Deploy automático!

### Opção 2: Deploy Manual

Ver instruções completas em: **[DEPLOY.md](./DEPLOY.md)**

---

## 💻 Desenvolvimento Local

### Pré-requisitos

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** 9+
- **Chave API Gemini** ([Obter aqui](https://aistudio.google.com/app/apikey))

### Instalação

```bash
# Clone o repositório
git clone https://github.com/Vaz-Cortex/cortex-4.git
cd cortex-4

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env.local

# Edite .env.local e adicione sua GEMINI_API_KEY
nano .env.local
```

### Executar

```bash
# Modo desenvolvimento (localhost:3000)
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview
```

---

## 🔐 Segurança

### ✅ Implementado

- ✅ API key protegida no backend
- ✅ Rate limiting (10 planos/hora, 100 TTS/hora)
- ✅ Validação de origem (CORS)
- ✅ Sanitização de inputs
- ✅ Sem exposição de credenciais no frontend

### ⚠️ Próximos Passos

- [ ] Autenticação de usuários (NextAuth)
- [ ] Rate limiting por usuário (Redis)
- [ ] Logs de auditoria
- [ ] Validação de schemas (Zod)
- [ ] CSRF protection

---

## 📚 Documentação Completa

- **[CLAUDE.md](./CLAUDE.md)** - Documentação técnica para IA
- **[DEPLOY.md](./DEPLOY.md)** - Guia de deploy detalhado
- **[CHANGELOG.md](#)** - Histórico de versões

---

## 🛠️ Stack Técnica

| Categoria | Tecnologias |
|-----------|-------------|
| **Frontend** | React, TypeScript, Vite, Tailwind CSS |
| **Backend** | Vercel Serverless Functions, Node.js |
| **IA/ML** | Google Gemini 2.5 Pro/Flash, TTS |
| **Storage** | IndexedDB (cache), localStorage |
| **Deploy** | Vercel, GitHub Actions |
| **Tools** | Showdown (MD), Web Audio API |

---

## 📊 Estrutura do Projeto

```
cortex-4/
├── api/                    # Backend serverless functions
│   ├── _lib/              # Utilitários compartilhados
│   │   ├── gemini.ts      # Cliente Gemini
│   │   └── rateLimit.ts   # Rate limiting
│   ├── generate-plan.ts   # Endpoint: planos de estudo
│   ├── generate-speech.ts # Endpoint: TTS
│   └── generate-summary.ts# Endpoint: resumos
├── components/            # Componentes React
│   ├── AudioPlayer.tsx    # Player de áudio
│   └── icons.tsx          # Biblioteca de ícones
├── hooks/                 # Custom React hooks
│   └── useAudioPlayer.ts  # Hook de áudio
├── services/              # Camada de serviço
│   └── geminiService.ts   # Cliente API (frontend)
├── utils/                 # Utilitários
│   ├── audioUtils.ts      # Decodificação de áudio
│   ├── db.ts             # IndexedDB wrapper
│   └── fileUtils.ts       # Exportação de arquivos
├── App.tsx                # Componente principal
├── index.html             # Template HTML
├── types.ts               # TypeScript types
└── vite.config.ts         # Configuração Vite
```

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'feat: Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

### Convenção de Commits

- `feat:` Nova funcionalidade
- `fix:` Correção de bug
- `docs:` Documentação
- `style:` Formatação
- `refactor:` Refatoração
- `test:` Testes
- `chore:` Manutenção

---

## 📄 Licença

Este projeto está sob a licença MIT. Ver arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 👨‍💻 Autor

**Amândio Vaz**

- GitHub: [@Vaz-Cortex](https://github.com/Vaz-Cortex)
- AI Studio: [Cortex DeepMind](https://ai.studio/apps/drive/1eLqqJc0nHbPilE5KPWgGH1jDLa-xCpeg)

---

## 🙏 Agradecimentos

- Google Gemini API
- Vercel Platform
- React Team
- Comunidade Open Source

---

## 📞 Suporte

- **Issues:** [GitHub Issues](https://github.com/Vaz-Cortex/cortex-4/issues)
- **Discussões:** [GitHub Discussions](https://github.com/Vaz-Cortex/cortex-4/discussions)

---

<div align="center">

**Desenvolvido com ❤️ por Amândio Vaz - 2025**

⭐ Se este projeto foi útil, considere dar uma estrela!

</div>
