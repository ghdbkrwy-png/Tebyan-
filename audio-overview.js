const {
  MODEL_TEXT, MODEL_TEXT_FALLBACK, MODEL_TTS, MODEL_TTS_FALLBACK,
  CORS, json, callGemini, extractText, extractAudioPart, pcmToWavBase64
} = require('./_lib');

const HOST_A = 'المذيع';
const HOST_B = 'المذيعة';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'الطريقة غير مسموحة' });

  try {
    const { fileBase64, mimeType } = JSON.parse(event.body || '{}');
    if (!fileBase64) return json(400, { error: 'لم يتم إرفاق ملف.' });

    // الخطوة 1: كتابة نص حواري بين مذيعَين حول المستند
    const scriptPrompt = `اكتب نص حوار إذاعي طبيعي بالعربية الفصحى بين مذيعَين، "${HOST_A}" و"${HOST_B}"، يناقشان أهم أفكار المستند المرفق بأسلوب ودّي وسلس كأنهما في بودكاست. من 10 إلى 14 مداخلة متبادلة، كل مداخلة سطر واحد يبدأ باسم المتحدث متبوعًا بنقطتين تمامًا هكذا:
${HOST_A}: ...
${HOST_B}: ...
لا تضف أي عناوين أو مقدمات خارج الحوار نفسه.`;

    const scriptPayload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType || 'application/pdf', data: fileBase64 } },
          { text: scriptPrompt }
        ]
      }]
    };

    const scriptData = await callGemini(MODEL_TEXT, MODEL_TEXT_FALLBACK, scriptPayload);
    const transcript = extractText(scriptData).trim();
    if (!transcript) return json(500, { error: 'تعذّر توليد نص الحوار.' });

    // الخطوة 2: تحويل الحوار إلى صوت بمتحدثَين مختلفين
    const ttsPayload = {
      contents: [{ parts: [{ text: transcript }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: HOST_A, voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
              { speaker: HOST_B, voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
            ]
          }
        }
      }
    };

    const ttsData = await callGemini(MODEL_TTS, MODEL_TTS_FALLBACK, ttsPayload);
    const audio = extractAudioPart(ttsData);
    if (!audio) return json(500, { error: 'تم توليد النص لكن تعذّر توليد الصوت.' });

    const wavBase64 = pcmToWavBase64(audio.base64, audio.mimeType);
    return json(200, { transcript, audioBase64: wavBase64, mimeType: 'audio/wav' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
