'use server';

import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getEvolutionInstanceStatus,
  getEvolutionQRCode,
  logoutEvolutionInstance,
  updateEvolutionWebhook,
  getEvolutionChats,
  getEvolutionMessages,
  sendEvolutionMessage,
  extractMessageText,
  jidToPhone,
  type EvolutionChat,
  type EvolutionMessage,
} from '@/lib/evolution';

// ============================================================
// Helpers de instância
// ============================================================

/**
 * Retorna o nome da instância derivado do userId logado.
 * NÃO usar diretamente — pode não corresponder à instância real conectada.
 * Usar getActiveInstanceName() em vez disso.
 */
async function getInstanceName() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return `crm_${user.id.replace(/-/g, '')}`;
}

/**
 * Retorna o instance_name real conectado, na seguinte ordem de prioridade:
 * 1. Se remoteJid for passado: busca em whatsapp_chats pelo remoteJid (mais recente)
 * 2. Registro mais recente em whatsapp_chats (instância ativa do sistema)
 * 3. Única instância open da Evolution API
 * 4. Fallback: derivar do userId (legado — pode falhar em multi-tenant)
 */
async function getActiveInstanceName(remoteJid?: string): Promise<string> {
  const admin = createAdminClient();

  // 1. Por remoteJid específico
  if (remoteJid) {
    const { data: rows } = await admin
      .from('whatsapp_chats')
      .select('instance_name')
      .eq('remote_jid', remoteJid)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (rows?.[0]?.instance_name) {
      console.log(`[instance] ✅ via remoteJid (${remoteJid}):`, rows[0].instance_name);
      return rows[0].instance_name;
    }
  }

  // 2. Registro mais recente no banco
  const { data: latest } = await admin
    .from('whatsapp_chats')
    .select('instance_name')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (latest?.[0]?.instance_name) {
    console.log('[instance] ✅ via whatsapp_chats mais recente:', latest[0].instance_name);
    return latest[0].instance_name;
  }

  // 3. Fallback: userId (legado)
  const fallback = await getInstanceName();
  console.warn('[instance] ⚠️ fallback userId (banco vazio):', fallback);
  return fallback;
}


// ============================================================
// Status
// ============================================================

export async function checkWhatsAppStatus() {
  try {
    const instanceName = await getInstanceName();
    const status = await getEvolutionInstanceStatus(instanceName);
    const state = status?.instance?.state || status?.state || 'close';
    return { success: true, state, instanceName };
  } catch (error: any) {
    return { success: false, state: 'error', error: error.message };
  }
}

// ============================================================
// Connect / Disconnect
// ============================================================

export async function connectWhatsApp() {
  try {
    const instanceName = await getInstanceName();
    const qrData = await getEvolutionQRCode(instanceName);

    if (qrData.alreadyConnected) {
      return { success: true, alreadyConnected: true };
    }

    return { success: true, qr: qrData.base64 || qrData.qrcode };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function disconnectWhatsApp() {
  try {
    const instanceName = await getInstanceName();
    await logoutEvolutionInstance(instanceName);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================
// Webhook — atualizar URL para Vercel
// ============================================================

export async function updateWebhookUrl() {
  try {
    const instanceName = await getInstanceName();
    await updateEvolutionWebhook(instanceName);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================
// FASE 3 — Carga inicial: sync de chats/mensagens
// ============================================================

export async function syncWhatsAppChats(): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const instanceName = await getActiveInstanceName();

    const chats = await getEvolutionChats(instanceName);
    if (!chats.length) return { success: true, count: 0 };

    // Upsert na tabela whatsapp_chats
    const rows = chats.map((chat: EvolutionChat) => {
      const lastMsgText = extractMessageText(chat.lastMessage?.message);
      const lastMsgAt = chat.lastMessage?.messageTimestamp
        ? new Date(chat.lastMessage.messageTimestamp * 1000).toISOString()
        : chat.updatedAt || new Date().toISOString();

      return {
        user_id: user.id,
        instance_name: instanceName,
        remote_jid: chat.remoteJid,
        push_name: chat.pushName || jidToPhone(chat.remoteJid),
        profile_pic_url: chat.profilePicUrl || null,
        last_message: lastMsgText || null,
        last_message_at: lastMsgAt,
        unread_count: chat.unreadCount || 0,
        is_group: false,
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('whatsapp_chats')
      .upsert(rows, { onConflict: 'instance_name,remote_jid', ignoreDuplicates: false });

    if (error) {
      console.error('[syncWhatsAppChats] upsert error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (error: any) {
    console.error('[syncWhatsAppChats]', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================
// Inbox — listar conversas (de whatsapp_chats, já sincronizado)
// ============================================================

export async function getInboxContacts(): Promise<any[]> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const instanceName = await getActiveInstanceName();

    const { data, error } = await createAdminClient()
      .from('whatsapp_chats')
      .select('*')
      .eq('instance_name', instanceName)
      .eq('is_group', false)
      .order('last_message_at', { ascending: false })
      .limit(100);

    if (error || !data) return [];


    // Mapear para formato esperado pelo ChatInterface
    return data.map((chat) => ({
      id: chat.id,
      phone: jidToPhone(chat.remote_jid),
      remoteJid: chat.remote_jid,
      name: chat.push_name || jidToPhone(chat.remote_jid),
      lastMessage: chat.last_message || '',
      timestamp: chat.last_message_at || chat.updated_at,
      unreadCount: chat.unread_count || 0,
      profilePicUrl: chat.profile_pic_url || null,
      isLead: false, // TODO: cross-reference with leads table
    }));
  } catch (error: any) {
    console.error('[getInboxContacts]', error.message);
    return [];
  }
}

// ============================================================
// Histórico de mensagens de uma conversa
// ============================================================

export async function getChatHistory(remoteJid: string): Promise<any[]> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    // Busca a instância real da conversa (corrige bug de user_id diferente do dono da instância)
    const instanceName = await getActiveInstanceName(remoteJid);

    // Isso evita o bug onde mensagens inbound chegam sem user_id correto via webhook
    const adminClient = createAdminClient();
    const { data: cached } = await adminClient
      .from('whatsapp_messages')
      .select('*')
      .eq('instance_name', instanceName)
      .eq('remote_jid', remoteJid)
      .order('sent_at', { ascending: true, nullsFirst: false })
      .limit(150);

    if (cached && cached.length > 0) {
      return cached.map(normalizeMessage);
    }

    // Fallback: buscar direto da Evolution e persistir
    const evMsgs = await getEvolutionMessages(instanceName, remoteJid, 50);
    if (!evMsgs.length) return [];

    const rows = evMsgs.map((msg: EvolutionMessage) => ({
      user_id: user.id,
      instance_name: instanceName,
      message_key: msg.key.id,
      remote_jid: remoteJid,
      from_me: msg.key.fromMe ?? false,
      push_name: msg.pushName || null,
      message_type: msg.messageType || 'conversation',
      content: extractMessageText(msg.message),
      status: normalizeStatus(msg.status),
      sent_at: msg.messageTimestamp
        ? new Date(msg.messageTimestamp * 1000).toISOString()
        : null,
      created_at: msg.messageTimestamp
        ? new Date(msg.messageTimestamp * 1000).toISOString()
        : new Date().toISOString(),
      raw_payload: msg as any,
      message_id: msg.key.id,
      phone_normalized: jidToPhone(remoteJid),
      direction: msg.key.fromMe ? 'outbound' : 'inbound',
      provider: 'evolution',
    }));

    // Persiste sem lançar erro se já existir (ignoreDuplicates)
    await adminClient
      .from('whatsapp_messages')
      .upsert(rows, { onConflict: 'message_key', ignoreDuplicates: true });

    return rows.map(normalizeMessage);
  } catch (error: any) {
    console.error('[getChatHistory]', error.message);
    return [];
  }
}

// ============================================================
// Marcar conversa como lida
// ============================================================

export async function markChatAsRead(remoteJid: string) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const instanceName = await getActiveInstanceName(remoteJid);

    await supabase
      .from('whatsapp_messages')
      .update({ status: 'read' })
      .eq('user_id', user.id)
      .eq('instance_name', instanceName)
      .eq('remote_jid', remoteJid)
      .eq('from_me', false)
      .neq('status', 'read');

    // Zerar unread_count no chat
    await supabase
      .from('whatsapp_chats')
      .update({ unread_count: 0 })
      .eq('user_id', user.id)
      .eq('instance_name', instanceName)
      .eq('remote_jid', remoteJid);
  } catch (error: any) {
    console.error('[markChatAsRead]', error.message);
  }
}

// ============================================================
// Enviar mensagem
// ============================================================

// Converte QUALQUER valor capturado em string legível e serializável pelo Next.js.
// Regra crítica: JSON.stringify(new Error("x")) === "{}" — nunca usar JSON.stringify em Error diretamente.
function safeStr(e: unknown, fallback = 'Erro desconhecido no envio'): string {
  if (!e) return fallback;
  if (typeof e === 'string') return e.trim() || fallback;
  // Error padrão: usar name + message
  if (e instanceof Error) {
    return [e.name !== 'Error' ? e.name : '', e.message].filter(Boolean).join(': ') || fallback;
  }
  // Objeto com campos comuns
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const msg =
      (typeof o.message === 'string' ? o.message : '') ||
      (typeof o.error === 'string' ? o.error : '') ||
      (typeof o.code === 'string' ? o.code : '') ||
      (typeof o.details === 'string' ? o.details : '');
    if (msg) return msg;
    try { return JSON.stringify(e); } catch { return fallback; }
  }
  return String(e) || fallback;
}

export async function sendChatMessage(
  remoteJid: string,
  content: string
): Promise<{
  success: boolean;
  messageKey?: string;
  error?: string;
  details?: Record<string, string | number | null>;
}> {
  const diagnostics: Record<string, string | number | null> = {
    remoteJid,
    instanceName: null,
    phone: null,
    endpoint: null,
    httpStatus: null,
    responseBody: null,
  };

  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Usuário não autenticado' };

    // CORREÇÃO: buscar instance_name real do banco via remoteJid.
    // getInstanceName() usa o user_id do usuário LOGADO, que pode diferir
    // do usuário que conectou o WhatsApp — causando 404 na Evolution API.
    // Se houver mais de um registro para o mesmo remoteJid, usa o mais recente.
    const adminClient = createAdminClient();
    let instanceName: string;

    const { data: chatRows } = await adminClient
      .from('whatsapp_chats')
      .select('instance_name, updated_at')
      .eq('remote_jid', remoteJid)
      .order('updated_at', { ascending: false })
      .limit(1);

    const chatRow = chatRows?.[0];

    if (chatRow?.instance_name) {
      instanceName = chatRow.instance_name;
      console.log('[sendChatMessage] ✅ instance_name do banco:', instanceName);
    } else {
      // Fallback: remoteJid ainda não tem chat no banco (nova conversa)
      instanceName = await getInstanceName();
      console.log('[sendChatMessage] ⚠️  instance_name fallback (userId — remoteJid não encontrado no banco):', instanceName);
    }


    const phone = jidToPhone(remoteJid);
    const endpoint = `/message/sendText/${instanceName}`;

    diagnostics.instanceName = instanceName;
    diagnostics.phone = phone;
    diagnostics.endpoint = endpoint;

    console.log('[sendChatMessage] iniciando envio', {
      instanceName,
      phone,
      remoteJid,
      endpoint,
      contentLen: content.length,
    });


    console.log('\n=== [ENVIO TEMPORÁRIO] Iniciando Envio ===');
    console.log(`Instância a ser usada: ${instanceName}`);
    console.log(`RemoteJid destino: ${remoteJid}`);
    console.log(`Endpoint esperado: ${endpoint}`);

    // Enviar via Evolution API
    let sendRes: any;
    try {
      sendRes = await sendEvolutionMessage(instanceName, phone, content);
      console.log(`[ENVIO TEMPORÁRIO] Sucesso na chamada à Evolution API.`);
      console.log('==========================================\n');
    } catch (apiErr: unknown) {
      const errMsg = safeStr(apiErr);
      console.error('\n[ENVIO TEMPORÁRIO] ERRO na Evolution API:');
      console.error(`Status ou Mensagem: ${errMsg}`);
      console.error('==========================================\n');
      
      diagnostics.error = errMsg;
      let userFriendlyError = errMsg;
      if (errMsg.includes('404') || errMsg.includes('not exist')) {
          userFriendlyError = 'Instância não encontrada (404). Verifique se o WhatsApp está conectado e se o nome da instância está correto na Evolution API.';
      } else if (errMsg.includes('401') || errMsg.includes('403')) {
          userFriendlyError = 'Não autorizado (401/403). Verifique a EVOLUTION_API_KEY no arquivo .env.local.';
      } else if (errMsg.includes('fetch')) {
          userFriendlyError = 'Falha de rede. O CRM não conseguiu se conectar à Evolution API.';
      }

      return { success: false, error: userFriendlyError, details: diagnostics };
    }

    // Persistir no Supabase
    const msgKey = sendRes?.key?.id || `local_${Date.now()}`;
    const { error: dbErr } = await supabase.from('whatsapp_messages').insert({
      user_id: user.id,
      instance_name: instanceName,
      message_key: msgKey,
      remote_jid: remoteJid,
      from_me: true,
      message_type: 'conversation',
      content,
      status: 'sent',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      message_id: msgKey,
      phone_normalized: phone,
      direction: 'outbound',
      provider: 'evolution',
    });

    if (dbErr) {
      // Erro no DB não impede o sucesso do envio (já foi enviado no WhatsApp)
      console.warn('[sendChatMessage] DB insert warn:', dbErr.message);
    }

    // Atualizar last_message no chat (best-effort, não bloqueia)
    supabase.from('whatsapp_chats').update({
      last_message: content,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
      .eq('instance_name', instanceName)
      .eq('remote_jid', remoteJid)
      .then(() => {});

    return { success: true, messageKey: msgKey };

  } catch (error: unknown) {
    const errMsg = safeStr(error);
    console.error('[sendChatMessage] ERRO INESPERADO (object):', error);
    console.error('[sendChatMessage] ERRO INESPERADO (string):', errMsg);
    diagnostics.error = errMsg;
    return { success: false, error: errMsg, details: diagnostics };
  }
}


// ============================================================
// Iniciar nova conversa com qualquer número
// ============================================================

export async function startNewConversation(
  phone: string
): Promise<{ success: boolean; remoteJid?: string; error?: string }> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const instanceName = await getActiveInstanceName();

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) return { success: false, error: 'Número inválido' };
    const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
    const remoteJid = `${fullNumber}@s.whatsapp.net`;

    // Garantir que o chat existe na tabela para aparecer no inbox
    await supabase.from('whatsapp_chats').upsert(
      {
        user_id: user.id,
        instance_name: instanceName,
        remote_jid: remoteJid,
        push_name: phone,
        is_group: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'instance_name,remote_jid', ignoreDuplicates: true }
    );

    return { success: true, remoteJid };
  } catch (error: any) {
    console.error('[startNewConversation]', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================
// Helpers internos
// ============================================================

function normalizeMessage(msg: any) {
  return {
    id: msg.id || msg.message_key,
    message_id: msg.message_key || msg.message_id,
    content: msg.content || '',
    direction: msg.from_me ? 'outbound' : (msg.direction || 'inbound'),
    status: msg.status || 'sent',
    created_at: msg.created_at || msg.sent_at || new Date().toISOString(),
    push_name: msg.push_name,
    remote_jid: msg.remote_jid,
  };
}

function normalizeStatus(evStatus?: string): string {
  const map: Record<string, string> = {
    DELIVERY_ACK: 'delivered',
    READ: 'read',
    PLAYED: 'read',
    ERROR: 'failed',
    PENDING: 'pending',
    SERVER_ACK: 'sent',
  };
  return (evStatus && map[evStatus]) || 'sent';
}
