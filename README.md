# Gerador de Etiquetas ZPL — Zebra GC420T

Aplicação web para geração de códigos ZPL para impressoras Zebra GC420T.
Etiquetas no formato **40×25mm a 203 DPI**.

## Stack

- **Frontend**: React 18 + Vite (raiz do projeto)
- **Backend**: Node.js + Express (pasta `/api`, serverless no Vercel)
- **Banco de dados**: PostgreSQL
- **Deploy**: Vercel (monorepo)

## Configuração Local

### 1. Clonar e instalar dependências

```bash
git clone <repo>
cd etiquetas

# Instalar dependências do frontend
npm install

# Instalar dependências da API
cd api && npm install && cd ..
```

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` na raiz:

```bash
cp .env.example .env
```

Edite `.env`:

```
DATABASE_URL=postgresql://usuario:senha@localhost:5432/etiquetas
JWT_SECRET=sua-chave-secreta-muito-segura
PORT=3001
NODE_ENV=development
```

### 3. Banco de dados PostgreSQL

Crie o banco e execute o schema:

```bash
createdb etiquetas
psql etiquetas < db/init.sql
```

Isso cria:
- Tabelas `users` e `skus`
- Usuário admin padrão: `admin@jp7parts.com.br` / `admin123`
- 5 SKUs de exemplo

### 4. Executar localmente

```bash
npm run dev
```

Isso inicia:
- API: `http://localhost:3001`
- Frontend: `http://localhost:5173`

## Deploy no Vercel

### 1. Configure as variáveis de ambiente no Vercel:

```
DATABASE_URL=<sua-connection-string-postgresql>
JWT_SECRET=<chave-secreta-forte>
NODE_ENV=production
FRONTEND_URL=https://seu-dominio.vercel.app
```

### 2. Conecte o repositório ao Vercel

O `vercel.json` já está configurado para:
- Servir a API em `/api/*` via `@vercel/node`
- Servir o frontend compilado em `/*` via `@vercel/static-build`

### 3. Execute o schema no banco de produção

```bash
psql $DATABASE_URL < db/init.sql
```

## Funcionalidades

### Para todos os usuários autenticados:
- **Gerar por SKU**: Selecione um SKU cadastrado (com busca), visualize local de armazenamento e gere ZPL
- **Gerar Personalizado**: Insira SKU e descrição manualmente

### Para administradores:
- **Gerenciar SKUs**: CRUD completo de SKUs com busca

### Output ZPL:
- Visualização do código ZPL formatado
- Copiar para clipboard
- Baixar como arquivo `.zpl`
- Tentar imprimir via WebSocket (`ws://localhost:9100`)
- Link para preview no Labelary Online Viewer

## Formato da Etiqueta

```
^XA
^PW320          ; Largura: 40mm (320 dots a 203 DPI)
^LL200          ; Altura: 25mm (200 dots a 203 DPI)
^CI28           ; Encoding UTF-8
^FO10,5^A0N,20,20^FB300,2,2,^FD{descricao_curta}^FS   ; Descrição
^FO10,50^BY{n}^BCN,90,N,N,N^FD{sku}^FS                ; Código de barras
^FO10,148^A0N,18,18^FB300,1,,C^FD{sku}^FS             ; SKU abaixo do barcode
^XZ
```

**Largura do módulo do barcode (BY):**
- ≤10 chars: 3 (mais largo)
- 11-15 chars: 2
- ≥16 chars: 1 (mais fino)

## Credenciais Padrão

| Email | Senha | Role |
|-------|-------|------|
| admin@jp7parts.com.br | admin123 | admin |

**Importante**: Troque a senha do admin em produção!

## Estrutura do Projeto

```
etiquetas/
├── vercel.json          # Configuração Vercel
├── package.json         # Dependências frontend + scripts
├── vite.config.js       # Configuração Vite
├── index.html           # Entry point HTML
├── .env.example         # Template de variáveis de ambiente
├── db/
│   └── init.sql         # Schema do banco + dados iniciais
├── api/                 # Backend Express (serverless Vercel)
│   ├── package.json
│   ├── index.js         # App Express principal
│   ├── db.js            # Conexão PostgreSQL
│   ├── middleware/
│   │   └── auth.js      # JWT middleware
│   └── routes/
│       ├── auth.js      # Login e /me
│       ├── skus.js      # CRUD de SKUs
│       └── labels.js    # Geração de ZPL
└── src/                 # Frontend React
    ├── main.jsx
    ├── App.jsx
    ├── index.css
    ├── components/
    │   ├── Login.jsx
    │   ├── Layout.jsx
    │   ├── SKUManagement.jsx
    │   ├── GenerateFromSKU.jsx
    │   ├── GenerateCustom.jsx
    │   └── ZPLOutput.jsx
    └── utils/
        ├── api.js       # Axios com interceptors JWT
        └── zpl.js       # Utilitários ZPL (gerar, copiar, baixar, imprimir)
```
