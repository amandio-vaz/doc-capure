# 🚀 GUIA DE DEPLOY - CORTEX DEEPMIND

## 📋 Visão Geral

Este guia explica como fazer deploy do Cortex DeepMind na **Vercel** com backend seguro.

## 🔐 Arquitetura de Segurança

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Frontend  │─────→│ Vercel Edge  │─────→│  Gemini API │
│   (React)   │ HTTP │   Functions  │ HTTPS│             │
└─────────────┘      └──────────────┘      └─────────────┘
                      ↑ API Key segura
                      ↑ Rate limiting
                      ↑ Validação CORS
```

**Benefícios:**
- ✅ API key nunca é exposta ao cliente
- ✅ Rate limiting para prevenir abuso
- ✅ Validação de origem (CORS)
- ✅ Custos controlados
- ✅ Logs centralizados

---

## 🛠️ PRÉ-REQUISITOS

1. **Conta na Vercel**
   - Criar em: https://vercel.com/signup
   - Conectar com GitHub

2. **Chave da API do Gemini**
   - Obter em: https://aistudio.google.com/app/apikey
   - Criar nova chave se necessário

3. **Repositório no GitHub**
   - Fork ou push deste projeto

---

## 📦 PASSO 1: Preparar o Projeto

### 1.1 Instalar Dependências

```bash
npm install
```

### 1.2 Criar .env.local para Desenvolvimento

```bash
cp .env.example .env.local
```

Editar `.env.local` e adicionar sua chave:
```env
GEMINI_API_KEY=sua_chave_aqui
```

### 1.3 Testar Localmente

```bash
npm run dev
```

Acesse: http://localhost:3000

---

## ☁️ PASSO 2: Deploy na Vercel

### 2.1 Import do Projeto

1. Acesse: https://vercel.com/new
2. Clique em "Import Git Repository"
3. Selecione o repositório `cortex-4`
4. Clique em "Import"

### 2.2 Configurar Framework

O Vercel deve detectar automaticamente:
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### 2.3 Configurar Environment Variables

**IMPORTANTE:** Adicione a variável de ambiente:

1. Na tela de configuração, clique em "Environment Variables"
2. Adicione:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** [SUA_CHAVE_AQUI]
   - **Environments:** Production, Preview, Development (todos)

3. Clique em "Add"

### 2.4 Deploy

1. Clique em "Deploy"
2. Aguarde o build (1-3 minutos)
3. Acesse sua URL: `https://cortex-deepmind-xxx.vercel.app`

---

## ✅ PASSO 3: Verificar Funcionamento

### 3.1 Teste do Frontend

Acesse a URL do deploy e verifique:
- ✅ Página carrega sem erros
- ✅ Interface aparece corretamente

### 3.2 Teste dos Endpoints

Abra o DevTools (F12) e tente gerar um plano:

**Console deve mostrar:**
```
POST https://seu-dominio.vercel.app/api/generate-plan 200 OK
```

**Se aparecer erro 403:**
- Verifique se a GEMINI_API_KEY está configurada
- Vá em Settings > Environment Variables
- Redeploy o projeto

**Se aparecer erro 429:**
- Rate limit atingido (10 planos/hora)
- Aguarde 1 hora ou ajuste em `/api/_lib/rateLimit.ts`

---

## 🔧 PASSO 4: Configurações Avançadas

### 4.1 Domínio Customizado

1. Vá em: Settings > Domains
2. Adicione seu domínio
3. Configure DNS conforme instruções

### 4.2 Ajustar Rate Limits

Editar `/api/_lib/rateLimit.ts`:

```typescript
const RATE_LIMITS = {
  'generate-plan': { max: 20, windowMs: 60 * 60 * 1000 }, // 20/hora
  'generate-summary': { max: 50, windowMs: 60 * 60 * 1000 }, // 50/hora
  'generate-speech': { max: 200, windowMs: 60 * 60 * 1000 }, // 200/hora
};
```

Commit e push para atualizar.

### 4.3 Habilitar Analytics

1. Vá em: Analytics tab
2. Clique em "Enable Analytics"
3. Visualize métricas de uso

### 4.4 Configurar Alertas de Custos

No Google AI Studio:
1. Acesse: https://aistudio.google.com/app/billing
2. Configure alertas de orçamento
3. Defina limite mensal (ex: $10/mês)

---

## 📊 MONITORAMENTO

### Logs do Backend

Ver logs das functions:
1. Acesse: https://vercel.com/[seu-usuario]/cortex-4
2. Vá em: Deployments > Latest > Functions
3. Clique em uma function para ver logs

### Métricas de Rate Limit

Os headers HTTP retornam informações:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 2025-11-23T15:30:00.000Z
```

---

## 🐛 TROUBLESHOOTING

### Erro: "API_KEY environment variable not set"

**Solução:**
```bash
# Na Vercel:
1. Settings > Environment Variables
2. Adicione GEMINI_API_KEY
3. Redeploy em: Deployments > ⋯ > Redeploy
```

### Erro: "Origem não autorizada" (403)

**Solução:**
Editar `/api/_lib/gemini.ts` e adicionar sua URL:

```typescript
const allowedOrigins = [
  'https://seu-dominio.vercel.app',
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
];
```

### Build Falhou

**Causas comuns:**
- TypeScript errors → Ver logs do build
- Dependências faltando → `npm install`
- Imports incorretos → Verificar paths

### API muito lenta

**Melhorias:**
1. Cache mais agressivo (IndexedDB já implementado)
2. Usar gemini-flash ao invés de gemini-pro
3. Reduzir maxOutputTokens

---

## 🔄 ATUALIZAR DEPLOY

### Via Git (Recomendado)

```bash
git add .
git commit -m "feat: Nova funcionalidade"
git push origin main
```

A Vercel faz deploy automático!

### Via Vercel CLI

```bash
npm i -g vercel
vercel --prod
```

---

## 💰 CUSTOS ESTIMADOS

### Gemini API (Pay-as-you-go)

| Operação | Modelo | Custo/1K tokens |
|----------|--------|-----------------|
| Plano de estudo | gemini-2.5-pro | ~$0.01 |
| Resumo | gemini-2.5-flash | ~$0.0005 |
| TTS | gemini-flash-tts | ~$0.002/min |

**Estimativa mensal (uso moderado):**
- 100 planos: ~$10
- 500 resumos: ~$2.50
- 300 min áudio: ~$0.60
- **Total: ~$13/mês**

### Vercel (Hobby - Grátis)

- ✅ 100 GB bandwidth
- ✅ Unlimited requests
- ✅ Serverless Functions incluídas
- ⚠️ Limite: 100 GB-Hours/mês

**Para uso pessoal/MVP: GRÁTIS!** 🎉

---

## 📝 PRÓXIMOS PASSOS

1. ✅ Deploy funcionando
2. Adicionar autenticação (NextAuth, Clerk)
3. Implementar banco de dados (Supabase, PlanetScale)
4. Migrar para Next.js para SSR
5. Adicionar testes automatizados
6. Configurar CI/CD avançado

---

## 🆘 SUPORTE

- **Documentação Vercel:** https://vercel.com/docs
- **Gemini API Docs:** https://ai.google.dev/gemini-api/docs
- **Issues GitHub:** [Criar issue](https://github.com/Vaz-Cortex/cortex-4/issues)

---

*Última atualização: 2025-11-23*
