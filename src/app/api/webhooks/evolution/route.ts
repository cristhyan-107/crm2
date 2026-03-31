import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { WebhookPayload } from '@/lib/evolution/types';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    let payload: WebhookPayload;
    
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // 1. Validation (Strict matching to Evolution Webhooks configs)
    const webhookSecret = req.headers.get('webhook-secret') || req.headers.get('apikey');
    if (webhookSecret !== process.env.EVOLUTION_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 401 });
    }

    const { event, instance, data } = payload;
    
    // Uses Service Role Key to bypass RLS for webhook backend system processes
    const supabase = createAdminClient();

    // 2. MESSAGES_UPSERT (Receiving new messages or echoes)
    if (event === 'MESSAGES_UPSERT' || event === 'SEND_MESSAGE') {
      const message = Array.isArray(data?.messages) ? data.messages[0] : (data?.key ? data : null);
      if (!message) return NextResponse.json({ success: true, message: 'No valid message found in payload' });

      const isFromMe = message.key?.fromMe || false;
      const remoteJid = message.key?.remoteJid || '';
      
      // Ignore array broadcasts or status updates here
      if (remoteJid.includes('@broadcast') || remoteJid === 'status@broadcast') {
        return NextResponse.json({ success: true });
      }

      const phoneNormalized = remoteJid.split('@')[0];
      const messageId = message.key?.id;
      
      let content = '';
      if (message.message?.conversation) content = message.message.conversation;
      else if (message.message?.extendedTextMessage?.text) content = message.message.extendedTextMessage.text;

      // 3. Duplicate Webhook Handling (Idempotency)
      const { data: existingMsg } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('message_id', messageId)
        .single();
        
      if (existingMsg) {
        return NextResponse.json({ success: true, message: 'Message already processed (Idempotency)' });
      }

      // 4. Missing Lead Scenario matching
      // Find the associated lead based on phone number slice
      const phoneEnd = phoneNormalized.slice(-8);
      const { data: leads } = await supabase
        .from('leads')
        .select('id, user_id')
        .like('phone', `%${phoneEnd}%`)
        .limit(1);

      const lead = leads && leads.length > 0 ? leads[0] : null;

      // 5. Inbound/Outbound Insert (Even if lead is missing, store message for orphan logging)
      const { error: insertError } = await supabase.from('whatsapp_messages').insert({
        message_id: messageId,
        user_id: lead?.user_id || null, // Might be null if it's an unknown contact
        lead_id: lead?.id || null,
        instance_name: instance,
        provider: 'evolution',
        event_type: event,
        direction: isFromMe ? 'outbound' : 'inbound',
        phone_normalized: phoneNormalized,
        content: content,
        status: isFromMe ? 'sent' : 'delivered',
        raw_payload: payload,
      });

      if (insertError) {
        console.error('Webhook insert error:', insertError);
        return NextResponse.json({ error: 'DB Insert Failed' }, { status: 500 });
      }
      
      // 6. Inbound Message timeline log parsing
      if (lead && !isFromMe) {
          await supabase.from('activities').insert({
             user_id: lead.user_id,
             lead_id: lead.id,
             type: 'whatsapp',
             description: `Lead enviou WhatsApp: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
             metadata: { message_id: messageId, direction: 'inbound' }
          });
      }

    } 
    // 7. Status Update Flow (Read Receipts, Server Ack)
    else if (event === 'MESSAGES_UPDATE') {
      const messageUpdate = Array.isArray(data) ? data[0] : data;
      if (!messageUpdate || !messageUpdate.key) return NextResponse.json({ success: true });
      
      const messageId = messageUpdate.key.id;
      
      const statusMap: Record<number, string> = {
        2: 'sent',
        3: 'delivered',
        4: 'read'
      };
      
      const newStatus = statusMap[messageUpdate.update?.status];
      if (newStatus) {
         await supabase.from('whatsapp_messages')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('message_id', messageId);
      }
    } 
    // 8. Other Events
    else {
      // e.g., CONTACTS_UPDATE, CHATS_UPSERT, CONNECTION_UPDATE
      // Ignored for DB inserts at this MVP context level but logged. 
      console.log(`[Evolution Webhook] Ignored or auxiliary event: ${event}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Unhandled Webhook exception:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
