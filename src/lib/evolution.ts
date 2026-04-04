function buildUrl(path: string) {
  const BASE_URL = process.env.EVOLUTION_API_URL || '';
  const cleanBase = BASE_URL.replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}

export async function evolutionFetch(endpoint: string, options?: RequestInit) {
  const API_KEY = process.env.EVOLUTION_API_KEY;

  if (!process.env.EVOLUTION_API_URL || !API_KEY) {
    throw new Error('Evolution API missing credentials in environment variables.');
  }

  const finalUrl = buildUrl(endpoint);

  console.log(`\n--- EVOLUTION API CALL ---`);
  console.log(`[REQUEST] ${options?.method || 'GET'} ${finalUrl}`);
  if (options?.body) {
    console.log(`[PAYLOAD]`, options.body);
  }

  const res = await fetch(finalUrl, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY,
      ...(options?.headers || {}),
    },
  });

  const textBody = await res.text();
  
  console.log(`[RESPONSE STATUS] ${res.status} ${res.statusText}`);
  console.log(`[RESPONSE BODY]`, textBody);

  if (!res.ok) {
    let errorMessage = `Evolution API error: ${res.status}`;
    try {
      if (textBody) {
        const errBody = JSON.parse(textBody);
        if (errBody?.response?.message && Array.isArray(errBody.response.message)) {
          errorMessage = errBody.response.message[0];
        } else if (errBody?.response?.message) {
          errorMessage = errBody.response.message;
        } else {
          errorMessage = errBody?.message || errBody?.error || errorMessage;
        }
      }
    } catch {
      // Ignore parse error
    }
    console.error(`[EVOLUTION ERROR PARSED]`, errorMessage);
    throw new Error(errorMessage);
  }

  return textBody ? JSON.parse(textBody) : {};
}

export async function createEvolutionInstance(instanceName: string) {
  const appUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  
  const response = await evolutionFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        url: `${appUrl}/api/webhooks/evolution`,
        byEvents: false,
        base64: false,
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE"
        ]
      }
    })
  });

  return response;
}

export async function setEvolutionWebhook(instanceName: string) {
  const appUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  
  try {
    await evolutionFetch(`/webhook/set/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        url: `${appUrl}/api/webhooks/evolution`,
        webhook_by_events: false,
        webhook_base64: false,
        events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE"
        ]
      })
    });
  } catch (err: any) {
    console.warn(`Falha ao definir webhook para ${instanceName}:`, err.message);
  }
}

export async function getEvolutionInstanceStatus(instanceName: string) {
  try {
    const response = await evolutionFetch(`/instance/connectionState/${instanceName}`, {
      method: 'GET'
    });
    return response; // { instance: { state: "open" } }
  } catch (error: any) {
    if (error.message && (error.message.includes('404') || error.message.includes('not exist'))) {
      return { state: 'not_found', status: 'NOT_FOUND' };
    }
    // Caso de timeout ou unauthorized fallback logic
    return { state: 'unauthorized', status: 'DISCONNECTED', error: error.message };
  }
}

export async function fetchInstances() {
  return evolutionFetch('/instance/fetchInstances', {
    method: 'GET'
  });
}

export async function connectInstance(instanceName: string) {
  return getEvolutionQRCode(instanceName);
}

export async function ensureInstanceExists(instanceName: string) {
  const status = await getEvolutionInstanceStatus(instanceName);
  
  if (status?.status === 'NOT_FOUND' || status?.state === 'not_found' || (status?.error && status.error.includes('not exist'))) {
    return null; // Instance does not exist yet
  }
  
  return status;
}

export async function getEvolutionQRCode(instanceName: string): Promise<any> {
  console.log(`\n[Evolution API] Iniciando fluxo QR Code para: ${instanceName}`);
  const startTime = Date.now();

  // Step 1: Check if instance already exists and is connected
  const existingStatus = await ensureInstanceExists(instanceName);
  
  if (existingStatus) {
    const state = existingStatus?.instance?.state || existingStatus?.state;
    console.log(`[Evolution API] Instância existente encontrada, estado: ${state}`);
    
    if (state === 'open') {
      return { alreadyConnected: true, state: 'open' };
    }
    
    // Instance exists but not connected - delete and recreate for a clean start
    console.log(`[Evolution API] Deletando instância existente para recriar...`);
    try {
      await deleteEvolutionInstance(instanceName);
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.warn('[Evolution API] Falha ao deletar instância antiga:', e);
    }
  }

  // Step 2: Create fresh instance (v2.3.7 returns QR in create response)
  console.log(`[Evolution API] Criando nova instância...`);
  const createRes = await createEvolutionInstance(instanceName);
  
  // Check if QR came in the create response
  const createQR = createRes?.qrcode?.base64;
  if (createQR) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Evolution API] QR Code obtido na criação após ${elapsed}s (${createQR.length} chars)`);
    return { base64: createQR, ...createRes };
  }
  
  console.log(`[Evolution API] QR não veio no create, fazendo polling no /connect...`);

  // Step 3: Fallback - poll /connect endpoint
  const maxAttempts = 15;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    
    try {
      const response = await evolutionFetch(`/instance/connect/${instanceName}`, {
        method: 'GET'
      });
      
      const qrData = response.base64 || response.qrcode?.base64 || 
                      (typeof response.qrcode === 'string' && response.qrcode.length > 50 ? response.qrcode : null) ||
                      response.code;
      
      if (qrData) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Evolution API] QR Code obtido no poll ${i+1} após ${elapsed}s`);
        return { base64: qrData, ...response };
      }
      
      if (response.instance?.state === 'open' || response.state === 'open') {
        console.log(`[Evolution API] Instância conectou durante polling.`);
        return { alreadyConnected: true, state: 'open' };
      }
      
      console.log(`[Evolution API] Poll ${i+1}/${maxAttempts}: aguardando QR...`);
    } catch (err: any) {
      console.error(`[Evolution API] Erro no poll ${i+1}:`, err.message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  throw new Error(`Não foi possível gerar o QR Code após ${elapsed}s. Verifique se a Evolution API está respondendo corretamente.`);
}

export async function deleteEvolutionInstance(instanceName: string) {
  const response = await evolutionFetch(`/instance/delete/${instanceName}`, {
    method: 'DELETE'
  });
  return response;
}

export async function resetInstance(instanceName: string) {
  console.log(`\n[Evolution API] ---- HARD RESET START: ${instanceName} ----`);
  // 1. DELETE /instance/delete/:instance
  try {
    console.log(`[Evolution API] Deletando a instância ${instanceName}...`);
    await deleteEvolutionInstance(instanceName);
  } catch(e: any) {
    console.warn(`[Evolution API] Falha ao deletar a instância (pode não existir):`, e.message);
  }
  
  // 2. Aguardar 2s
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 3. POST /instance/create
  console.log(`[Evolution API] Recriando a instância ${instanceName}...`);
  try {
    await createEvolutionInstance(instanceName);
  } catch(e: any) {
    console.error(`[Evolution API] Erro crítico ao recriar instância durante o Reset:`, e.message);
  }
  
  // 4. GET /instance/connect é chamado indiretamente após o retorno (já que resetInstance é chamado antes de dar o novo getEvolutionQRCode loop)
  console.log(`[Evolution API] ---- HARD RESET END: ${instanceName} ----\n`);
}

export async function logoutEvolutionInstance(instanceName: string) {
  const response = await evolutionFetch(`/instance/logout/${instanceName}`, {
    method: 'DELETE'
  });
  return response;
}

export async function sendEvolutionMessage(instanceName: string, number: string, text: string) {
  return evolutionFetch(`/message/sendText/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      number,
      options: {
        delay: 1200,
        presence: "composing",
        linkPreview: false
      },
      textMessage: {
        text
      }
    })
  });
}
