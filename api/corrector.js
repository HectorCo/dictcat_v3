// API Route de Vercel - Proxy para múltiples correctores
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Mètode no permès' });
    return;
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Falta el text a corregir' });
      return;
    }

    // Intentar Softcatalà primero
    let result = await trySoftcatala(text);
    let source = 'softcatala';
    
    // Si falla, intentar LanguageTool
    if (!result) {
      result = await tryLanguageTool(text);
      source = 'languagetool';
    }

    if (!result) {
      throw new Error('No s\'ha pogut connectar amb cap corrector extern');
    }

    res.status(200).json({
      matches: result.matches || result || [],
      source: source
    });

  } catch (error) {
    console.error('Error en corrector:', error);
    res.status(200).json({ 
      matches: [],
      error: error.message,
      fallback: true
    });
  }
}

async function trySoftcatala(text) {
  try {
    const response = await fetch('https://api.softcatala.org/corrector/v1/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        text: text,
        language: 'ca'
      }).toString(),
      timeout: 5000
    });

    if (!response.ok) return null;
    
    const data = await response.json();
    return data;
  } catch (e) {
    console.log('Softcatalà falló:', e.message);
    return null;
  }
}

async function tryLanguageTool(text) {
  try {
    const response = await fetch('https://api.languagetool.org/api/v2/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        text: text,
        language: 'ca-ES',
        enabledOnly: 'false'
      }).toString(),
      timeout: 5000
    });

    if (!response.ok) return null;
    
    const data = await response.json();
    return data;
  } catch (e) {
    console.log('LanguageTool falló:', e.message);
    return null;
  }
}
