'use server';

import { createServerSupabase as createClient } from '@/lib/supabase/server';
import { sendEvolutionMessage } from '@/lib/evolution';
import { revalidatePath } from 'next/cache';

export async function getInboxContacts() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  // Obter mensages do usuário logado (ordem decrescente para ter a mais recente primeiro)
  const { data: messages, error } = await supabase
    .from('whatsapp_messages')
    .select('*, lead:leads(name, phone)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('Error fetching inbox messages:', error);
    return [];
  }

  // Agrupar por phone_normalized
  const contactsMap = new Map();

  for (const msg of messages) {
    const phone = msg.phone_normalized;
    if (!contactsMap.has(phone)) {
      contactsMap.set(phone, {
        phone: phone,
        name: msg.lead?.name || 'Desconhecido',
        lastMessage: msg.content,
        timestamp: msg.created_at,
        unreadCount: 0,
        isLead: !!msg.lead,
        leadId: msg.lead_id,
        messages: [] // Pode ser útil manter algumas no cache do client
      });
    }

    const contact = contactsMap.get(phone);
    // Adiciona ao histórico do contato (a mais recente vem primeiro, depois a gente inverte no client)
    contact.messages.push(msg);

    // Contar mensagens não lidas
    if (msg.direction === 'inbound' && msg.status !== 'read') {
      contact.unreadCount += 1;
    }
  }

  return Array.from(contactsMap.values());
}

export async function getChatHistory(phoneNormalized: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: messages, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('user_id', user.id)
    .eq('phone_normalized', phoneNormalized)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    console.error('Error fetching chat history:', error);
    return [];
  }

  return messages;
}

export async function markChatAsRead(phoneNormalized: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { success: false };

  // Apenas mensagens inbound que não estão lidas
  await supabase
    .from('whatsapp_messages')
    .update({ status: 'read', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('phone_normalized', phoneNormalized)
    .eq('direction', 'inbound')
    .neq('status', 'read');

  revalidatePath('/chat');
  return { success: true };
}

export async function sendChatMessage(phoneNormalized: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthorized');

  const instanceName = `crm_${user.id.replace(/-/g, '')}`;

  try {
    // 1. Enviar mensagem via Evolution API
    const response = await sendEvolutionMessage(instanceName, phoneNormalized, content);

    // 2. Verificar se existe Lead com esse phone_normalized
    const phoneEnd = phoneNormalized.slice(-8);
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', user.id)
      .like('phone', `%${phoneEnd}%`)
      .limit(1);

    const leadId = leads && leads.length > 0 ? leads[0].id : null;

    // 3. O próprio Evolution Webhook (SEND_MESSAGE ou MESSAGES_UPSERT)
    // vai inserir essa message no Supabase.
    // Mas se quisermos resposta imediata no chat sem depender do webhook:
    
    // (Opcional) Podemos inserir otimisticamente aqui. 
    // Porém a api pode ser rápida o suficiente para o webhook computar.
    
    // Revalidar path
    revalidatePath('/chat');

    return { success: true, response };
  } catch (err: any) {
    console.error('Falha ao enviar mensagem de chat:', err);
    throw new Error(err.message || 'Falha ao enviar mensagem');
  }
}
