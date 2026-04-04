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
// Helpers internos
// ============================================================

async function getInstanceName() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return `crm_${user.id.replace(/-/g, '')}`;
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

    const instanceName = await getInstanceName();

    // Buscar chats da Evolution API
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

    const instanceName = await getInstanceName();

    const { data, error } = await supabase
      .from('whatsapp_chats')
      .select('*')
      .eq('user_id', user.id)
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

    const instanceName = await getInstanceName();

    // 1. Tentar buscar do Supabase primeiro (mais rápido)
    const { data: cached } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('instance_name', instanceName)
      .eq('remote_jid', remoteJid)
      .order('created_at', { ascending: true })
      .limit(100);

    // 2. Se houver dados no cache, retornar
    if (cached && cached.length > 0) {
      return cached.map(normalizeMessage);
    }

    // 3. Fallback: buscar direto da Evolution e persistir
    const evMsgs = await getEvolutionMessages(instanceName, remoteJid, 50);

    if (!evMsgs.length) return [];

    // Persistir no Supabase para próximas consultas
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
      // Legacy fields
      message_id: msg.key.id,
      phone_normalized: jidToPhone(remoteJid),
      direction: msg.key.fromMe ? 'outbound' : 'inbound',
      provider: 'evolution',
    }));

    await supabase
      .from('whatsapp_messages')
      .upsert(rows, { onConflict: 'message_key', ignoreDuplicates: true })
      .throwOnError();

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

    const instanceName = await getInstanceName();

    // Atualizar status das mensagens
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

export async function sendChatMessage(remoteJid: string, content: string) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const instanceName = await getInstanceName();
  const phone = jidToPhone(remoteJid);

  // Enviar via Evolution API
  const sendRes = await sendEvolutionMessage(instanceName, phone, content);

  // Persistir no Supabase
  const msgKey = sendRes?.key?.id || `local_${Date.now()}`;
  await supabase.from('whatsapp_messages').insert({
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
    // legacy
    message_id: msgKey,
    phone_normalized: phone,
    direction: 'outbound',
    provider: 'evolution',
  });

  // Atualizar last_message no chat
  await supabase
    .from('whatsapp_chats')
    .update({
      last_message: content,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('instance_name', instanceName)
    .eq('remote_jid', remoteJid);

  return { success: true, messageKey: msgKey };
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
