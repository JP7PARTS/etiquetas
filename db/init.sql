-- ZPL Label Generator - Database Schema
-- Run this file to initialize the database

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(10) CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skus (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  descricao_longa VARCHAR(500),
  descricao_curta VARCHAR(100),
  local VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warning_labels (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  zpl TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Default admin user: admin@jp7parts.com.br / admin123
-- Password hash generated with bcrypt rounds=10
INSERT INTO users (email, password_hash, role)
VALUES (
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
