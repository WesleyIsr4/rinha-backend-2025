# Rinha Backend 2025 - Payment Processor

Backend para a Rinha de Backend 2025 que intermedeia solicitações de pagamentos para serviços de Payment Processor.

## 🚀 Tecnologias Utilizadas

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Validação**: Joi
- **HTTP Client**: Axios
- **Logging**: Winston
- **Containerização**: Docker + Docker Compose
- **Load Balancer**: Nginx
- **Banco de Dados**: PostgreSQL
- **Cache**: Redis

## 📋 Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- Git

## 🛠️ Instalação e Configuração

### 1. Clone o repositório

```bash
git clone <seu-repositorio>
cd rinha-backend-2025
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

```bash
cp env.example .env
# Edite o arquivo .env com suas configurações
```

### 4. Execute em desenvolvimento

```bash
npm run dev
```

## 🐳 Execução com Docker

### 1. Build das imagens

```bash
docker-compose build
```

### 2. Execute os serviços

```bash
docker-compose up -d
```

### 3. Verifique os logs

```bash
docker-compose logs -f
```

## 📡 Endpoints

### POST /payments

Processa um pagamento.

**Request:**

```json
{
  "correlationId": "4a7901b8-7d26-4d9d-aa19-4dc1c7cf60b3",
  "amount": 19.9
}
```

**Response:**

```json
{
  "message": "Payment processed successfully",
  "correlationId": "4a7901b8-7d26-4d9d-aa19-4dc1c7cf60b3",
  "amount": 19.9,
  "processor": "default"
}
```

### GET /payments/summary

Retorna resumo dos pagamentos processados.

**Query Parameters:**

- `from` (opcional): Data inicial no formato ISO UTC
- `to` (opcional): Data final no formato ISO UTC

**Response:**

```json
{
  "default": {
    "totalRequests": 43236,
    "totalAmount": 415542345.98
  },
  "fallback": {
    "totalRequests": 423545,
    "totalAmount": 329347.34
  }
}
```

### GET /health

Health check da aplicação.

### GET /health/payment-processors

Status dos Payment Processors.

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Executar testes em modo watch
npm run test:watch

# Executar testes com coverage
npm run test:coverage
```

## 📊 Monitoramento

- **Logs**: Estruturados com Winston
- **Health Checks**: Endpoints dedicados
- **Métricas**: Performance e disponibilidade

## 🔧 Desenvolvimento

### Estrutura do Projeto

```
src/
├── app.js                 # Aplicação principal
├── routes/               # Rotas da aplicação
│   ├── payments.js       # Rotas de pagamentos
│   └── health.js         # Rotas de health check
├── services/             # Lógica de negócio
│   └── paymentService.js # Serviço de pagamentos
├── middleware/           # Middlewares
│   ├── errorHandler.js   # Tratamento de erros
│   └── requestLogger.js  # Logging de requisições
├── validators/           # Validações
│   └── paymentValidator.js
└── utils/               # Utilitários
    └── logger.js        # Sistema de logging
```

### Scripts Disponíveis

- `npm start`: Inicia a aplicação
- `npm run dev`: Inicia em modo desenvolvimento
- `npm test`: Executa testes
- `npm run lint`: Executa linting
- `npm run lint:fix`: Corrige problemas de linting

## 🚀 Deploy

### Docker Compose

```bash
docker-compose up -d
```

### Variáveis de Ambiente

- `NODE_ENV`: Ambiente (development/production)
- `PORT`: Porta da aplicação (padrão: 9999)
- `LOG_LEVEL`: Nível de log (padrão: info)

## 📝 Licença

MIT

## 👨‍💻 Autor

Wesley - Rinha de Backend 2025
