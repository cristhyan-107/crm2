-- Adicionar colunas config e snapshot na tabela reports
ALTER TABLE public.reports 
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS snapshot JSONB DEFAULT '{}'::jsonb;

-- Atualizar possíveis políticas (rls) se necessário, mas geralmente admins já teriam acesso a tudo.
