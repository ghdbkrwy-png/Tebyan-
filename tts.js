const { MODEL_TTS, MODEL_TTS_FALLBACK, CORS, json, callGemini, extractAudioPart, pcmToWavBase64 } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'الطريقة غير مسموحة' });

  try {
    const { text, voice } = JSON.parse(event.body || '{}');
    if (!text) return json(400, { error: 'لا يوجد نص للنطق به.' });

    const payload = {
      contents: [{ parts: [{ text: `اقرأ النص التالي بصوت عربي فصيح وطبيعي: ${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Kore' } }
        }
      }
    };

    const data = await callGemini(MODEL_TTS, MODEL_TTS_FALLBACK, payload);
    const audio = extractAudioPart(data);
    if (!audio) return json(500, { error: 'لم يتم توليد صوت.' });

    const wavBase64 = pcmToWavBase64(audio.base64, audio.mimeType);
    return json(200, { audioBase64: wavBase64, mimeType: 'audio/wav' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
