import { createAdminClient } from '@/lib/supabase/admin';
import { SendWhatsAppMessageParams, SendWhatsAppMessageResponse } from './types';

export async function sendWhatsAppMessage(
  params: SendWhatsAppMessageParams
): Promise<SendWhatsAppMessageResponse> {
  const supabase = createAdminClient();
  
  const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
  const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
  const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME;
  
  // Clean phone to numeric only
  const phoneNormalized = params.phone.replace(/\D/g, '');
  
  // Predictable temporary message ID for initial persistence before response
  const tempMessageId = `outbound_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  try {
    // 1. Initial persistence (status: pending)
    const { error: insertError } = await supabase.from('whatsapp_messages').insert({
      user_id: params.userId,
      lead_id: params.leadId || null,
      message_id: tempMessageId,
      instance_name: EVOLUTION_INSTANCE_NAME || 'default',
      provider: 'evolution',
      event_type: 'SEND_MESSAGE',
      direction: 'outbound',
      phone_normalized: phoneNormalized,
      content: params.message,
      status: 'pending',
    });

    if (insertError) {
      console.error('Failed to insert initial pending message:', insertError);
      throw new Error(`DB Insert Error: ${insertError.message}`);
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
      throw new Error('Evolution API missing credentials in environment variables.');
    }

    // 2. Execute Evolution HTTP API request
    const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: phoneNormalized,
        text: params.message,
        options: {
          delay: 1200,
          presence: 'composing'
        }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || data?.error || 'Failed to send WhatsApp message via API.');
    }

    // 3. Status updates after provider confirmation
    // Usually Evolution returns the new real message ID in data.key.id or data.id
    const realMessageId = data?.key?.id || data?.id || tempMessageId;

    await supabase.from('whatsapp_messages').update({
      message_id: realMessageId,
      status: 'sent',
      raw_payload: data,
    }).eq('message_id', tempMessageId);

    // Write internal activities feed
    if (params.leadId) {
      await supabase.from('activities').insert({
        user_id: params.userId,
        lead_id: params.leadId,
        type: 'whatsapp',
        description: `WhatsApp Enviado: ${params.message.substring(0, 50)}${params.message.length > 50 ? '...' : ''}`,
        metadata: { message_id: realMessageId, direction: 'outbound' }
      });
    }

    return {
      success: true,
      messageId: realMessageId,
      status: 'sent',
    };

  } catch (error: any) {
    // 4. Failure handling gracefully
    console.error('sendWhatsAppMessage error:', error);
    
    // Switch the initially pending db row to a failed state
    await supabase.from('whatsapp_messages').update({
      status: 'failed',
      error_message: error?.message || 'Unknown error occurred',
    }).eq('message_id', tempMessageId);

    return {
      success: false,
      status: 'failed',
      error: error?.message || 'Unknown error occurred',
    };
  }
}
