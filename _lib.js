// وحدة مشتركة تستخدمها كل دوال Netlify — نداء Gemini، تحويل PCM إلى WAV، رؤوس CORS.

// أحدث نموذج نصّي مجاني ضمن حدود الاستخدام (Flash family) — بدّله هنا إذا صدر أحدث منه.
const MODEL_TEXT = 'gemini-3.7-flash';
const MODEL_TEXT_FALLBACK = 'gemini-2.5-flash';

// أحدث نموذج TTS مجاني ضمن حدود الاستخدام — بدّله هنا إذا صدر أحدث منه.
const MODEL_TTS = 'gemini-3.1-flash-tts-preview';
const MODEL_TTS_FALLBACK = 'gemini-2.5-flash-preview-tts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

// ينادي Gemini بنموذج معيّن، ويجرّب النموذج البديل تلقائيًا إذا فشل الأساسي (مثلاً غير متاح بعد لهذا المفتاح).
async function callGemini(model, fallbackModel, payload) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('لم يتم ضبط GEMINI_API_KEY في إعدادات البيئة (Environment variables) على Netlify.');
  }
  const tryModel = async (m) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || `فشل طلب Gemini (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  };

  try {
    return await tryModel(model);
  } catch (err) {
    if (fallbackModel && (err.status === 404 || err.status === 400)) {
      return await tryModel(fallbackModel);
    }
    throw err;
  }
}

function extractText(data) {
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!parts) return '';
  return parts.map(p => p.text || '').join('');
}

function extractAudioPart(data) {
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!parts) return null;
  const part = parts.find(p => p.inlineData || p.inline_data);
  if (!part) return null;
  const inline = part.inlineData || part.inline_data;
  return { base64: inline.data, mimeType: inline.mimeType || inline.mime_type || 'audio/L16;rate=24000' };
}

// يحوّل صوت PCM الخام (L16) الذي يرجعه Gemini TTS إلى ملف WAV قابل للتشغيل مباشرة في المتصفح.
function pcmToWavBase64(base64Pcm, mimeType) {
  const pcmBuffer = Buffer.from(base64Pcm, 'base64');
  let sampleRate = 24000;
  const rateMatch = /rate=(\d+)/.exec(mimeType || '');
  if (rateMatch) sampleRate = parseInt(rateMatch[1], 10);

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]).toString('base64');
}

function tryParseJson(text) {
  // يزيل أسوار Markdown ```json لو أضافها النموذج رغم الطلب بعدم فعل ذلك
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

module.exports = {
  MODEL_TEXT, MODEL_TEXT_FALLBACK, MODEL_TTS, MODEL_TTS_FALLBACK,
  CORS, json, callGemini, extractText, extractAudioPart, pcmToWavBase64, tryParseJson
};
