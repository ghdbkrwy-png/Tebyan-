const { MODEL_TEXT, MODEL_TEXT_FALLBACK, CORS, json, callGemini, extractText } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'الطريقة غير مسموحة' });

  try {
    const { fileBase64, mimeType, question, history } = JSON.parse(event.body || '{}');
    if (!fileBase64) return json(400, { error: 'لم يتم إرفاق ملف.' });
    if (!question) return json(400, { error: 'لم يتم إرسال سؤال.' });

    const systemNote = 'أنت مساعد يجيب حصريًا استنادًا إلى المستند المرفق. إن لم تجد الإجابة في المستند، قل ذلك بصراحة بدل التخمين. أجب بالعربية بإيجاز ووضوح.';

    const contents = [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mimeType || 'application/pdf', data: fileBase64 } },
        { text: systemNote }
      ]
    }];

    (history || []).forEach(turn => {
      contents.push({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] });
    });

    contents.push({ role: 'user', parts: [{ text: question }] });

    const payload = { contents };
    const data = await callGemini(MODEL_TEXT, MODEL_TEXT_FALLBACK, payload);
    const answer = extractText(data);
    return json(200, { answer });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
