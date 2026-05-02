-- ============================================================
-- Migration: Lead com múltiplos imóveis
-- 1. Torna leads.property_id nullable (retrocompat com dados existentes)
-- 2. Cria tabela junction lead_properties (many-to-many)
-- ============================================================

-- 1. Tornar property_id nullable (dados existentes não são afetados)
ALTER TABLE leads ALTER COLUMN property_id DROP NOT NULL;

-- 2. Tabela junction
CREATE TABLE IF NOT EXISTS lead_properties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_properties_lead_id     ON lead_properties(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_properties_property_id ON lead_properties(property_id);

-- 3. RLS
ALTER TABLE lead_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lead_properties"
  ON lead_properties FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_id
        AND leads.user_id = auth.uid()
        AND leads.deleted_at IS NULL
    )
  );

CREATE POLICY "Users can insert own lead_properties"
  ON lead_properties FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_id
        AND leads.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own lead_properties"
  ON lead_properties FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_id
        AND leads.user_id = auth.uid()
    )
  );

-- 4. Índice de performance em whatsapp_messages (busca por instance+jid)
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_instance_jid
  ON whatsapp_messages(instance_name, remote_jid);

-- Índice de ordenação por sent_at
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_at
  ON whatsapp_messages(sent_at ASC NULLS LAST);
