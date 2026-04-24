// API Route de Vercel - Proxy per a LanguageTool
// Versió corregida: sense enabledOnly, amb logs detallats, timeout ampliat

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

  // Parsejar el body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: 'Body JSON invàlid' });
    return;
  }

  const text = body?.text;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'Falta el text a corregir' });
    return;
  }

  console.log('→ Rebuda petició de correcció, longitud text:', text.length);

  try {
    const result = await tryLanguageTool(text);
    console.log('✅ Correcció obtinguda de:', result.source);

    res.status(200).json({
      matches: result.matches || [],
      source: result.source,
    });

  } catch (error) {
    console.error('❌ LanguageTool ha fallat:', error.message);

    // Retornem 200 amb fallback perquè el client pugui usar el corrector local
    res.status(200).json({
      matches: [],
      error: 'No s\'ha pogut connectar amb LanguageTool: ' + error.message,
      fallback: true,
    });
  }
}

// ─── LanguageTool ─────────────────────────────────────────────────────────────

async function tryLanguageTool(text) {
  console.log('→ Intentant LanguageTool...');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000); // 15 segons

  try {
    const body = new URLSearchParams({
      text: text,
      language: 'ca-ES'
      // SIN enabledOnly - aquest paràmetre no existeix a l'API pública
    }).toString();

    console.log('→ Body enviat:', body);

    const response = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    console.log('→ Status:', response.status);
    console.log('→ StatusText:', response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('→ Error body:', errorText.substring(0, 500));
      throw new Error(`LanguageTool HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log('✅ LanguageTool OK, errors trobats:', data?.matches?.length ?? 0);

    return { matches: data.matches || [], source: 'languagetool' };

  } catch (e) {
    clearTimeout(timer);
    console.log('✗ LanguageTool falló:', e.message);
    throw e;
  }
}
