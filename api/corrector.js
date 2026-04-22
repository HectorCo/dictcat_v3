// API Route de Vercel - Proxy per a múltiples correctors
// Versió corregida: timeout real amb AbortController, APIs en paral·lel

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

  // Assegurar que el body està parsed
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const text = body?.text;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'Falta el text a corregir' });
    return;
  }

  console.log('→ Rebuda petició de correcció, longitud text:', text.length);

  try {
    // Llançar les dues APIs en paral·lel — guanya la primera que respongui
    const result = await Promise.any([
      trySoftcatala(text),
      tryLanguageTool(text),
    ]);

    console.log('✅ Correcció obtinguda de:', result.source);

    res.status(200).json({
      matches: result.matches || [],
      source: result.source,
    });

  } catch (error) {
    // Promise.any llança AggregateError si TOTES fallen
    console.error('❌ Totes les APIs han fallat:');
    if (error.errors) {
      error.errors.forEach((e, i) => console.error(`  API ${i + 1}:`, e.message));
    } else {
      console.error(error.message);
    }

    // Retornem 200 amb fallback perquè el client pugui usar el corrector local
    res.status(200).json({
      matches: [],
      error: 'No s\'ha pogut connectar amb cap corrector extern',
      fallback: true,
    });
  }
}

// ─── Softcatalà ───────────────────────────────────────────────────────────────

async function trySoftcatala(text) {
  console.log('→ Intentant Softcatalà...');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch('https://api.softcatala.org/corrector/v1/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'DictCat/1.0',
      },
      body: new URLSearchParams({ text, language: 'ca' }).toString(),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Softcatalà HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Softcatalà OK, errors trobats:', data?.matches?.length ?? 0);

    return { matches: normalitzarSoftcatala(data), source: 'softcatala' };

  } catch (e) {
    clearTimeout(timer);
    console.log('✗ Softcatalà falló:', e.message);
    throw e; // Relançar perquè Promise.any ho gestioni
  }
}

// ─── LanguageTool ─────────────────────────────────────────────────────────────

async function tryLanguageTool(text) {
  console.log('→ Intentant LanguageTool...');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch('https://api.languagetool.org/api/v2/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'DictCat/1.0',
      },
      body: new URLSearchParams({
        text,
        language: 'ca-ES',
        enabledOnly: 'false',
      }).toString(),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`LanguageTool HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ LanguageTool OK, errors trobats:', data?.matches?.length ?? 0);

    return { matches: data.matches || [], source: 'languagetool' };

  } catch (e) {
    clearTimeout(timer);
    console.log('✗ LanguageTool falló:', e.message);
    throw e; // Relançar perquè Promise.any ho gestioni
  }
}

// ─── Normalitzar format Softcatalà → format LanguageTool ─────────────────────
// Softcatalà retorna un format diferent; l'homogeneïtzem perquè el client
// no hagi de gestionar dos formats diferents.

function normalitzarSoftcatala(data) {
  if (!data || !Array.isArray(data.errors)) return [];

  return data.errors.map(err => ({
    message: err.context || err.description || 'Error ortogràfic',
    offset: err.start ?? 0,
    length: (err.end ?? 0) - (err.start ?? 0),
    replacements: (err.suggestions || []).map(s => ({ value: s })),
    rule: { id: 'SOFTCATALA', description: 'Softcatalà' },
  }));
}
