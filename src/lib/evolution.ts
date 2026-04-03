export async function evolutionFetch(endpoint: string, options?: RequestInit) {
  const BASE_URL = process.env.EVOLUTION_API_URL;
  const API_KEY = process.env.EVOLUTION_API_KEY;

  if (!BASE_URL || !API_KEY) {
    throw new Error('Evolution API missing credentials in environment variables.');
  }

  // Ensure endpoint starts with a slash
  const urlPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  console.log(`\n--- EVOLUTION API CALL ---`);
  console.log(`[REQUEST] ${options?.method || 'GET'} ${urlPath}`);
  if (options?.body) {
    console.log(`[PAYLOAD]`, options.body);
  }

  const res = await fetch(`${BASE_URL}${urlPath}`, {
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
  const response = await evolutionFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    })
  });

  // Set webhook right after creation
  await setEvolutionWebhook(instanceName);

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
    // A instância não existe, tentar criar automaticamente
    try {
      await createEvolutionInstance(instanceName);
    } catch (error: any) {
      throw new Error(`A instância do WhatsApp ainda não existe. Tentando criar automaticamente, mas falhou: ${error.message}`);
    }
  }
  
  return instanceName;
}

export async function getEvolutionQRCode(instanceName: string) {
  for (let i = 0; i < 5; i++) {
    const response = await evolutionFetch(`/instance/connect/${instanceName}`, {
      method: 'GET'
    });
    
    if (response.base64 || response.qrcode) {
      return response; // Achou o QR Code
    }
    
    // Se response.count === 0, significa que a instância ainda está iniciando
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error("QR Code não pôde ser gerado a tempo. Tente novamente.");
}

export async function logoutEvolutionInstance(instanceName: string) {
  const response = await evolutionFetch(`/instance/logout/${instanceName}`, {
    method: 'DELETE'
  });
  return response;
}
