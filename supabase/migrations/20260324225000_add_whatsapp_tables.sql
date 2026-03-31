-- Migration: Add WhatsApp Messages Table (Evolution API Integration)

-- 1. Create ENUMs for evolution and messaging events
CREATE TYPE evolution_event_type AS ENUM (
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'SEND_MESSAGE',
  'CONTACTS_UPDATE',
  'CHATS_UPSERT',
  'CONNECTION_UPDATE'
);

CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

-- 2. Create the unified whatsapp_messages table
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  message_id TEXT UNIQUE NOT NULL,
  instance_name TEXT NOT NULL,
  provider TEXT DEFAULT 'evolution',
  event_type evolution_event_type,
  direction message_direction NOT NULL,
  phone_normalized TEXT NOT NULL,
  content TEXT,
  status message_status NOT NULL DEFAULT 'pending',
  raw_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indices for faster performance internally
CREATE INDEX idx_whatsapp_messages_user_id ON whatsapp_messages(user_id);
CREATE INDEX idx_whatsapp_messages_lead_id ON whatsapp_messages(lead_id);
CREATE INDEX idx_whatsapp_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX idx_whatsapp_messages_phone ON whatsapp_messages(phone_normalized);
CREATE INDEX idx_whatsapp_messages_created_at ON whatsapp_messages(created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- 5. Policies (Assuming authenticated users should only view/manage their own leads' messages) 
-- Webhooks will bypass this using Service Role Key
CREATE POLICY "Users can view own whatsapp messages"
  ON whatsapp_messages FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own whatsapp messages"
  ON whatsapp_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own whatsapp messages"
  ON whatsapp_messages FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own whatsapp messages"
  ON whatsapp_messages FOR DELETE USING (auth.uid() = user_id);

-- 6. Updated_at Trigger
CREATE TRIGGER update_whatsapp_messages_updated_at
  BEFORE UPDATE ON whatsapp_messages 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
