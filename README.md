# Rinha de Backend 2025

Backend robusto para o desafio Rinha de Backend 2025, implementando processamento de pagamentos com alta disponibilidade, performance otimizada e monitoramento avançado.

## 🚀 **Funcionalidades**

### **Core Features**

- ✅ **Processamento de Pagamentos** - Integração com processadores externos (Default e Fallback)
- ✅ **Circuit Breaker** - Proteção contra falhas em cascata
- ✅ **Retry com Exponential Backoff** - Recuperação automática de falhas
- ✅ **Health Checks** - Monitoramento de saúde dos processadores
- ✅ **Audit Logging** - Logs detalhados para auditoria
- ✅ **Data Consistency** - Verificações de consistência de dados

### **Otimizações de Performance** 🆕

- ✅ **Cache Redis** - Cache distribuído para health checks e summaries
- ✅ **Connection Pooling Otimizado** - Pool de conexões PostgreSQL configurado
- ✅ **Queries Otimizadas** - Consultas SQL com índices e agregações
- ✅ **Monitoramento P99** - Métricas de latência e throughput em tempo real
- ✅ **Cache Invalidation** - Invalidação inteligente de cache
- ✅ **Performance Metrics** - Métricas detalhadas de performance

### **Monitoramento e Observabilidade**

- ✅ **Health Endpoints** - `/health`, `/health/payment-processors`
- ✅ **Performance Monitoring** - `/health/performance` (P99, throughput)
- ✅ **Detailed Statistics** - `/health/stats` (métricas completas)
- ✅ **Audit Logs** - `/health/audit` (logs de auditoria)

## 🏗️ **Arquitetura**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nginx (LB)    │    │   App Instance  │    │   PostgreSQL    │
│   Port: 80      │◄──►│   Port: 3000    │◄──►│   Port: 5432    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │     Redis       │
                       │   Port: 6379    │
                       └─────────────────┘
```

## 📊 **Performance Metrics**

### **Latência (P99)**

- **Target**: < 1000ms
- **Monitoring**: `/health/performance`
- **Alerts**: Automático quando P99 > 1s

### **Throughput**

- **Target**: Máximo possível
- **Monitoring**: Requests por segundo
- **Window**: 1 minuto

### **Success Rate**

- **Target**: > 99%
- **Monitoring**: Taxa de sucesso em tempo real

## 🛠️ **Tecnologias**

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Cache**: Redis
- **Load Balancer**: Nginx
- **Containerization**: Docker & Docker Compose
- **Testing**: Jest & Supertest
- **Logging**: Winston
- **Validation**: Joi

## 🚀 **Quick Start**

### **1. Clone e Setup**

```bash
git clone <repository>
cd rinha-de-backend-2025
npm install
```

### **2. Environment**

```bash
cp env.example .env
# Configure as variáveis de ambiente
```

### **3. Docker (Recomendado)**

```bash
# Build e start
./scripts/build.sh

# Ou manualmente:
docker compose up -d
```

### **4. Local Development**

```bash
# Start PostgreSQL e Redis
docker compose up -d postgres redis

# Start app
npm run dev
```

## 📡 **API Endpoints**

### **Pagamentos**

```http
POST /payments
Content-Type: application/json

{
  "correlationId": "uuid-v4",
  "amount": 100.50
}
```

### **Resumo de Pagamentos**

```http
GET /payments/summary?from=2024-01-01T00:00:00Z&to=2024-01-31T23:59:59Z
```

### **Health Checks**

```http
GET /health                    # Health básico
GET /health/payment-processors # Health dos processadores
GET /health/performance        # Métricas P99 e throughput
GET /health/stats             # Estatísticas detalhadas
```

## 🔧 **Configuração**

### **Variáveis de Ambiente**

```env
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=rinha_backend
DB_USER=rinha_user
DB_PASSWORD=rinha_password

# Redis
REDIS_URL=redis://redis:6379

# App
NODE_ENV=production
PORT=3000
SIMULATE_PAYMENTS=false

# Performance
P99_THRESHOLD=1000
CACHE_TTL=300
```

### **Docker Resources**

```yaml
# Limites de recursos (conforme especificação)
nginx: 0.1 CPU, 50MB RAM
app1: 0.9 CPU, 225MB RAM
app2: 0.9 CPU, 225MB RAM
postgres: 0.1 CPU, 50MB RAM
redis: 0.1 CPU, 50MB RAM
```

## 🧪 **Testing**

### **Unit Tests**

```bash
npm test
```

### **Integration Tests**

```bash
npm run test:integration
```

### **Performance Tests**

```bash
# Teste de carga básico
npm run test:performance
```

## 📈 **Monitoramento**

### **Métricas Disponíveis**

- **Latência**: P50, P95, P99, média, min, max
- **Throughput**: Requests/segundo
- **Success Rate**: Taxa de sucesso
- **Database Pool**: Conexões ativas, idle, waiting
- **Cache Hit Rate**: Taxa de acerto do cache
- **Circuit Breaker**: Estados e transições

### **Alertas Automáticos**

- P99 > 1000ms
- Success rate < 99%
- Database pool esgotado
- Redis indisponível

## 🔍 **Debugging**

### **Logs Estruturados**

```json
{
  "level": "info",
  "message": "Payment processed successfully",
  "correlationId": "uuid",
  "processor": "default",
  "responseTime": 150,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### **Audit Logs**

```bash
# Ver logs de auditoria
curl http://localhost/health/audit

# Ver logs por correlation ID
curl http://localhost/health/audit/{correlationId}
```

## 🚨 **Circuit Breaker**

### **Estados**

- **CLOSED**: Normal operation
- **OPEN**: Failing, reject requests
- **HALF_OPEN**: Testing recovery

### **Configuração**

```javascript
{
  failureThreshold: 3,
  timeout: 30000, // 30s
  monitoringPeriod: 60000 // 1min
}
```

## 📊 **Cache Strategy**

### **Redis Cache**

- **Health Checks**: TTL 1 hora
- **Payment Summaries**: TTL 5 minutos
- **Correlation IDs**: TTL 10 minutos

### **Cache Invalidation**

- Automática após novos pagamentos
- Manual via endpoints de admin
- Fallback para memória se Redis indisponível

## 🎯 **Performance Targets**

### **Latência**

- **P50**: < 100ms
- **P95**: < 500ms
- **P99**: < 1000ms

### **Throughput**

- **Target**: Máximo possível
- **Monitoring**: Real-time RPS

### **Availability**

- **Target**: 99.9%
- **Monitoring**: Health checks contínuos

## 🔧 **Manutenção**

### **Reset Circuit Breakers**

```bash
curl -X POST http://localhost/health/reset-circuit-breakers
```

### **Clear Cache**

```bash
curl -X POST http://localhost/health/clear-health-cache
```

### **Clear Audit Logs**

```bash
curl -X POST http://localhost/health/clear-audit-logs
```

## 📝 **Logs**

### **Estrutura de Logs**

```
logs/
├── combined.log    # Todos os logs
├── error.log       # Apenas erros
└── access.log      # Logs de acesso
```

### **Níveis de Log**

- **error**: Erros críticos
- **warn**: Avisos importantes
- **info**: Informações gerais
- **debug**: Debug detalhado

## 🚀 **Deployment**

### **Docker Hub**

```bash
# Build e push automático via GitHub Actions
docker pull wesleyisr4/rinha-backend-2025:latest
```

### **Local Build**

```bash
docker build -t rinha-backend-2025 .
docker run -p 9999:9999 rinha-backend-2025
```

## 📚 **Documentação Adicional**

- [Instruções do Desafio](INSTRUCOES.md)
- [Especificação de Testes](SPECTESTENV.md)
- [Arquitetura Detalhada](docs/architecture.md)

## 🤝 **Contribuição**

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 **Licença**

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

**Desenvolvido para o Rinha de Backend 2025** 🏆
