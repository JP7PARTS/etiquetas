-- ZPL Label Generator - Database Schema
-- Run this file to initialize the database

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(10) CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skus (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  descricao_longa VARCHAR(500),
  descricao_curta VARCHAR(100),
  descricao_curta_2 VARCHAR(100),
  local VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warning_labels (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  zpl TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Histórico de gerações de lote (Etiquetas produtos)
CREATE TABLE IF NOT EXISTS print_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  user_email VARCHAR(255),
  items JSONB NOT NULL,
  total_skus INTEGER,
  total_labels INTEGER,
  origin VARCHAR(20) DEFAULT 'lote',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para manter Histórico e Ranking rápidos conforme o volume cresce
CREATE INDEX IF NOT EXISTS idx_print_history_created_at ON print_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_history_user_id ON print_history (user_id);

-- Solicitações de cadastro de SKU (operador pede, admin cadastra)
CREATE TABLE IF NOT EXISTS sku_requests (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) NOT NULL UNIQUE,
  titulo VARCHAR(300),
  local VARCHAR(20),
  requested_by INTEGER,
  requested_by_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Listas de picking (geradas do Importar Vendas; abertas no tablet para separar produtos)
CREATE TABLE IF NOT EXISTS picking_lists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  created_by INTEGER,
  created_by_name VARCHAR(100),
  items JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Módulo Envio Full (isolado, prefixo full_). Nenhuma tabela
-- existente é alterada; o cadastro `skus` é usado só para leitura.
-- ============================================================

-- Envios de Full gerados (histórico + feed "últimos envios" na tela de revisão)
CREATE TABLE IF NOT EXISTS full_shipments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  created_by INTEGER,
  created_by_name VARCHAR(100),
  params JSONB,          -- { periodo, regra: MAX|MEDIA|MEDIANA, dias_cobertura }
  items JSONB NOT NULL,  -- [{ codigo_ml, sku, qty }] quantidade final enviada
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_full_shipments_created_at ON full_shipments (created_at DESC);

-- Anotações persistentes por Código ML (sobrevivem entre envios)
CREATE TABLE IF NOT EXISTS full_notes (
  codigo_ml VARCHAR(60) PRIMARY KEY,
  note TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- SKUs que nunca devem ir pro Full (ex.: grandes demais, só vendem no cross)
CREATE TABLE IF NOT EXISTS full_excluidos (
  sku VARCHAR(100) PRIMARY KEY,
  motivo VARCHAR(200),
  created_by_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Anúncios marcados como "cross esgotado" (aguardando estoque do armazém voltar)
CREATE TABLE IF NOT EXISTS full_cross_wait (
  codigo_ml VARCHAR(60) PRIMARY KEY,
  sku VARCHAR(100),
  created_by_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Default admin user: admin@jp7parts.com.br / admin123
-- Password hash generated with bcrypt rounds=10
INSERT INTO users (username, email, password_hash, role)
VALUES (
  'admin',
  'admin@jp7parts.com.br',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin'
)
ON CONFLICT (email) DO NOTHING;

-- Note: the hash above is for 'admin123' using bcrypt with 10 rounds
-- If the hash doesn't work, generate a new one with:
-- node -e "const b=require('bcryptjs'); b.hash('admin123',10).then(h=>console.log(h))"

-- Sample SKUs for testing
INSERT INTO skus (sku, descricao_longa, descricao_curta, local) VALUES
  ('JP7-001', 'Parafuso Sextavado M8x30 Zincado', 'Parafuso M8x30', 'A1-01'),
  ('JP7-002', 'Porca Sextavada M8 Zincada', 'Porca M8', 'A1-02'),
  ('JP7-003', 'Arruela Lisa M8 Zincada', 'Arruela M8', 'A1-03'),
  ('JP7-010', 'Rolamento 6205 2RS 25x52x15', 'Rolamento 6205', 'B2-05'),
  ('JP7-011', 'Rolamento 6206 2RS 30x62x16', 'Rolamento 6206', 'B2-06')
ON CONFLICT (sku) DO NOTHING;
