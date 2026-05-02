import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractMessageText, jidToPhone } from '@/lib/evolution';

// ============================================================
// Webhook da Evolution API → Backend CRM
// Recebe eventos e persiste no Supabase
// ============================================================

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Validação de segurança (webhook secret)
    const secret = req.headers.get('webhook-secret') || req.headers.get('apikey');
    if (
      process.env.EVOLUTION_WEBHOOK_SECRET &&
      secret !== process.env.EVOLUTION_WEBHOOK_SECRET
    ) {
      // Log mas não bloqueia — Evolution às vezes envia sem o header configurado
      console.warn('[Webhook] Secret mismatch, proceeding anyway');
    }

    const { event, instance, data } = payload;
    
    // [LOG TEMPORÁRIO 1] - Recebimento do Webhook
    console.log(`\n=== [WEBHOOK TEMPORÁRIO] Evento Recebido ===`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Evento: ${event}`);
    console.log(`Instância: ${instance}`);
    // Log do ID da mensagem ou um pedaço pequeno se não tiver ID, sem expor tudo
    if (event === 'MESSAGES_UPSERT' || event === 'SEND_MESSAGE') {
       const msgData = Array.isArray(data?.messages) ? data.messages[0] : (data?.key ? data : (Array.isArray(data) ? data[0] : {}));
       console.log(`Message ID: ${msgData?.key?.id}`);
       console.log(`RemoteJid: ${msgData?.key?.remoteJid}`);
       console.log(`FromMe: ${msgData?.key?.fromMe}`);
    }
    console.log(`===========================================\n`);

    const supabase = createAdminClient();

    // Descobrir user_id a partir do instance_name (crm_{userId_sem_hifens})
    const instanceUserId = parseUserIdFromInstance(instance);

    // ============================================================
    // CONNECTION_UPDATE — Atualizar status da instância
    // ============================================================
    if (event === 'CONNECTION_UPDATE') {
      console.log(`[Webhook] CONNECTION_UPDATE for ${instance}:`, data?.state);
      // Nenhuma ação necessária por enquanto — frontend faz polling do status
      return NextResponse.json({ success: true });
    }

    // ============================================================
    // MESSAGES_UPSERT / SEND_MESSAGE — Nova mensagem
    // ============================================================
    if (event === 'MESSAGES_UPSERT' || event === 'SEND_MESSAGE') {
      const messages = Array.isArray(data?.messages)
        ? data.messages
        : data?.key
        ? [data]
        : Array.isArray(data)
        ? data
        : [];

      for (const message of messages) {
        await processMessage(supabase, instanceUserId, instance, message, event);
      }

      return NextResponse.json({ success: true });
    }

    // ============================================================
    // MESSAGES_UPDATE — Atualizar status (entregue, lido)
    // ============================================================
    if (event === 'MESSAGES_UPDATE') {
      const updates = Array.isArray(data) ? data : [data];

      for (const update of updates) {
        if (!update?.key?.id) continue;
        const statusMap: Record<number, string> = {
          1: 'pending',
          2: 'sent',
          3: 'delivered',
          4: 'read',
        };
        const newStatus = statusMap[update.update?.status];
        if (newStatus) {
          await supabase
            .from('whatsapp_messages')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('message_key', update.key.id);
        }
      }

      return NextResponse.json({ success: true });
    }

    // ============================================================
    // MESSAGES_DELETE
    // ============================================================
    if (event === 'MESSAGES_DELETE') {
      const keys = Array.isArray(data?.keys) ? data.keys : data?.key ? [data.key] : [];
      for (const key of keys) {
        if (key?.id) {
          await supabase
            .from('whatsapp_messages')
            .update({ content: '[Mensagem apagada]', updated_at: new Date().toISOString() })
            .eq('message_key', key.id);
        }
      }
      return NextResponse.json({ success: true });
    }

    // ============================================================
    // CHATS_UPSERT / CHATS_UPDATE — Atualizar cache de chats
    // ============================================================
    if (event === 'CHATS_UPSERT' || event === 'CHATS_UPDATE') {
      const chats = Array.isArray(data) ? data : [data];

      for (const chat of chats) {
        if (!chat?.remoteJid || !instanceUserId) continue;
        if (
          chat.remoteJid.includes('@broadcast') ||
          chat.remoteJid.includes('@g.us') ||
          chat.remoteJid.includes('status@')
        )
          continue;

        const lastText = extractMessageText(chat.lastMessage?.message);
        const lastAt = chat.lastMessage?.messageTimestamp
          ? new Date(chat.lastMessage.messageTimestamp * 1000).toISOString()
          : new Date().toISOString();

        await supabase.from('whatsapp_chats').upsert(
          {
            user_id: instanceUserId,
            instance_name: instance,
            remote_jid: chat.remoteJid,
            push_name: chat.pushName || jidToPhone(chat.remoteJid),
            profile_pic_url: chat.profilePicUrl || null,
            last_message: lastText || null,
            last_message_at: lastAt,
            unread_count: chat.unreadCount || 0,
            updated_at: new Date().toISOString(),
            // pipeline_stage is intentionally OMITTED here so manual moves are preserved
          },
          { onConflict: 'instance_name,remote_jid', ignoreDuplicates: false }
        );
      }

      return NextResponse.json({ success: true });
    }

    // ============================================================
    // CONTACTS_UPSERT — Atualizar nomes de contatos
    // ============================================================
    if (event === 'CONTACTS_UPSERT') {
      const contacts = Array.isArray(data) ? data : [data];

      for (const contact of contacts) {
        if (!contact?.id || !instanceUserId) continue;
        const remoteJid = contact.id.includes('@')
          ? contact.id
          : `${contact.id}@s.whatsapp.net`;

        if (contact.pushName || contact.profilePictureUrl) {
          await supabase
            .from('whatsapp_chats')
            .update({
              push_name: contact.pushName || undefined,
              profile_pic_url: contact.profilePictureUrl || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('instance_name', instance)
            .eq('remote_jid', remoteJid);
        }
      }

      return NextResponse.json({ success: true });
    }

    // Outros eventos: ignorar silenciosamente
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Webhook] Unhandled exception:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ============================================================
// Helper: processar uma mensagem e persistir
// ============================================================

async function processMessage(
  supabase: any,
  instanceUserId: string | null,
  instance: string,
  message: any,
  event: string
) {
  const remoteJid: string = message.key?.remoteJid || '';
  if (!remoteJid) return;

  // Ignorar broadcasts e grupos
  if (
    remoteJid.includes('@broadcast') ||
    remoteJid.includes('@g.us') ||
    remoteJid === 'status@broadcast'
  )
    return;

  const messageKey = message.key?.id;
  if (!messageKey) return;

  const fromMe: boolean = message.key?.fromMe ?? false;
  const content = extractMessageText(message.message);
  const pushName = message.pushName || null;
  const phone = jidToPhone(remoteJid);

  // Idempotência: evitar duplicatas
  const { data: existing } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('message_key', messageKey)
    .maybeSingle();

  if (existing) return;

  // Tentar encontrar lead pelo número
  const phoneEnd = phone.slice(-8);
  const { data: leads } = await supabase
    .from('leads')
    .select('id, user_id')
    .like('phone', `%${phoneEnd}%`)
    .limit(1);

  const lead = leads?.[0] || null;
  const userId = lead?.user_id || instanceUserId;

  const sentAt = message.messageTimestamp
    ? new Date(message.messageTimestamp * 1000).toISOString()
    : new Date().toISOString();

  // Inserir mensagem
  const { error: insertError } = await supabase.from('whatsapp_messages').insert({
    user_id: userId,
    lead_id: lead?.id || null,
    instance_name: instance,
    message_key: messageKey,
    remote_jid: remoteJid,
    from_me: fromMe,
    push_name: pushName,
    message_type: message.messageType || 'conversation',
    content,
    status: fromMe ? 'sent' : 'delivered',
    sent_at: sentAt,
    created_at: sentAt,
    raw_payload: message,
    // Legacy
    message_id: messageKey,
    phone_normalized: phone,
    direction: fromMe ? 'outbound' : 'inbound',
    provider: 'evolution',
    event_type: event,
    contact_name: pushName,
  });

  if (insertError) {
    console.error(`[WEBHOOK TEMPORÁRIO] ERRO ao salvar mensagem no Supabase:`, insertError.message);
  } else {
    console.log(`[WEBHOOK TEMPORÁRIO] Mensagem ${messageKey} salva com sucesso no Supabase. O Supabase Realtime deve emitir um INSERT agora.`);
  }

  // Atualizar cache de chats
  if (userId) {
    await supabase.from('whatsapp_chats').upsert(
      {
        user_id: userId,
        instance_name: instance,
        remote_jid: remoteJid,
        push_name: pushName || phone,
        last_message: content || null,
        last_message_at: sentAt,
        unread_count: fromMe ? 0 : 1, // Seremos mais precisos com CHATS_UPDATE
        updated_at: new Date().toISOString(),
        // pipeline_stage is intentionally OMITTED here so manual moves are preserved
      },
      { onConflict: 'instance_name,remote_jid', ignoreDuplicates: false }
    );

    // Incrementar unread_count para mensagens recebidas
    if (!fromMe) {
      await supabase.rpc('increment_unread_count', {
        p_instance: instance,
        p_jid: remoteJid,
      }).catch(() => {
        // fallback: ignore se RPC não existir
      });
    }
  }

  // Registrar atividade no timeline do lead
  if (lead && !fromMe && content) {
    await supabase.from('activities').insert({
      user_id: lead.user_id,
      lead_id: lead.id,
      type: 'whatsapp',
      description: `WhatsApp recebido: ${content.substring(0, 60)}${content.length > 60 ? '...' : ''}`,
      metadata: { message_key: messageKey, direction: 'inbound' },
    });
  }
}

// ============================================================
// Helper: extrair user_id do nome da instância
// ============================================================

function parseUserIdFromInstance(instance: string): string | null {
  if (!instance || !instance.startsWith('crm_')) return null;
  const stripped = instance.replace('crm_', '');
  if (stripped.length === 32) {
    return `${stripped.slice(0, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}-${stripped.slice(16, 20)}-${stripped.slice(20)}`;
  }
  return null;
}
