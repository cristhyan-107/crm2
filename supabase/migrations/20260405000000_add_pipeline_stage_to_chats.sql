-- Migration: Add pipeline_stage column to whatsapp_chats
-- Allows WhatsApp conversations to appear as cards in the Kanban Pipeline

ALTER TABLE whatsapp_chats
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'new';

CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_pipeline_stage
  ON whatsapp_chats (pipeline_stage);
