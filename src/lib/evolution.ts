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

export async function getEvolutionQRCode(instanceName: string, retryCount = 0): Promise<any> {
  console.log(`\n[Evolution API] Iniciando busca de QR Code para instância: ${instanceName} (Tentativa de Reset: ${retryCount})`);
  const startTime = Date.now();
  const maxAttempts = 20; // 20 segundos
  const waitMs = 1000;
  
  let currentState = 'unknown';

  for (let i = 0; i < maxAttempts; i++) {
    console.log(`[Evolution API] Buscando QR Code... tentativa ${i + 1}/${maxAttempts}`);
    
    try {
      const response = await evolutionFetch(`/instance/connect/${instanceName}`, {
        method: 'GET'
      });
      
      console.log(`[Evolution API] Resposta bruta /connect (tentativa ${i+1}):`, JSON.stringify(response));
      
      // Evolution API can send the QR in response.base64 or response.qrcode
      const qrData = response.base64 || response.qrcode?.base64 || response.qrcode;
      
      if (qrData) {
        const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Evolution API] QR Code encontrado na tentativa ${i + 1} após ${timeElapsed}s`);
        return {
          base64: qrData,
          ...response
        };
      }
      
      // Se response.count === 0, a instância ainda não gerou o QR Code
      if (response.instance?.state === 'open' || response.state === 'open') {
        console.log(`[Evolution API] A instância já está conectada.`);
        return { alreadyConnected: true, state: 'open' };
      }
      
    } catch (err: any) {
      console.error(`[Evolution API] Erro na tentativa ${i+1}: ${err.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  
  const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Evolution API] Conexão falhou/timeout após ${timeElapsed}s.`);

  // Consulta o status final para o log e frontend
  try {
    const finalStatus = await getEvolutionInstanceStatus(instanceName);
    console.log(`[Evolution API] Status final após timeout:`, JSON.stringify(finalStatus));
    currentState = finalStatus?.instance?.state || finalStatus?.state || 'unknown';
  } catch(e) {
    console.error('[Evolution API] Falha ao recuperar status final:', e);
  }

  // Se a instância estiver "connecting" travada sem progresso e ainda não atingimos o limite de tentativas
  if (currentState === 'connecting' || currentState === 'close' || currentState === 'unknown') {
    if (retryCount < 1) { // Permite 1 reset/retry por chamada inicial (limita a no maximo 2 tentativas reais)
      console.log(`[Evolution API] Instância detectada como inválida ou travada após timeout. Iniciando Auto-Reset (Tentativa ${retryCount + 1})...`);
      await resetInstance(instanceName);
      
      // Tentar gerar QR novamente chamando a si mesma com retry = 1
      return getEvolutionQRCode(instanceName, retryCount + 1);
    } else {
      console.log(`[Evolution API] Limite de tentativas de reset atingido. Abortando fluxo para a instância ${instanceName}.`);
    }
  }

  throw new Error(`A instância travou no status '${currentState}' sem gerar o QR. Reset foi tentado sem sucesso. Total de aguardo: ${timeElapsed} segundos. Tente se conectar novamente em breve.`);
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
