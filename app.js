const API = '/api';
const $ = id => document.getElementById(id);

const state = {
  fileBase64: null,
  mimeType: 'application/pdf',
  fileName: '',
  summaryPoints: [],
  slides: [],
  currentSlide: 0,
  chatHistory: [],
  audioCache: {}
};

let currentAudioEl = null;

/* ================= panel switching ================= */
function switchPanel(name){
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('active'));
  const panel = $('panel-' + name);
  if (panel) panel.classList.add('active');
  const btn = document.querySelector(`.rail-btn[data-panel="${name}"]`);
  if (btn) btn.classList.add('active');
}

document.querySelectorAll('.rail-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
});

$('newSourceBtn').addEventListener('click', () => {
  switchPanel('empty');
  $('fileInput').value = '';
});

/* ================= file upload ================= */
const dropzone = $('dropzone');
const fileInput = $('fileInput');
dropzone.addEventListener('click', () => fileInput.click());
['dragover','dragenter'].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave','drop'].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
fileInput.addEventListener('change', e => { const f = e.target.files[0]; if (f) handleFile(f); });

function setStatus(id, msg, isErr){
  const el = $(id);
  if (!el) return;
  el.innerHTML = msg || '';
  el.classList.toggle('err', !!isErr);
}

function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleFile(file){
  if (file.type !== 'application/pdf'){
    setStatus('uploadStatus', 'الرجاء اختيار ملف PDF صالح.', true);
    return;
  }
  setStatus('uploadStatus', '<span class="spinner"></span> جاري قراءة الملف...');
  try{
    state.fileBase64 = await fileToBase64(file);
    state.mimeType = file.type;
    state.fileName = file.name;
    resetDerivedState();

    $('sourceLabel').innerHTML = `<span class="dot"></span> ${file.name}`;
    setStatus('uploadStatus', '<span class="spinner"></span> جاري تحليل المستند عبر Gemini...');

    await analyzeDocument();
    document.querySelectorAll('.rail-btn[disabled]').forEach(b => b.disabled = false);
    setStatus('uploadStatus', 'تم تحليل المستند بنجاح.');
    switchPanel('overview');
  }catch(err){
    console.error(err);
    setStatus('uploadStatus', 'حدث خطأ: ' + err.message, true);
  }
}

function resetDerivedState(){
  state.summaryPoints = [];
  state.slides = [];
  state.currentSlide = 0;
  state.chatHistory = [];
  state.audioCache = {};
  $('summaryResultCard').style.display = 'none';
  $('summaryList').innerHTML = '';
  $('slideViewer').style.display = 'none';
  $('chatMessages').innerHTML = '';
  $('studyResult').style.display = 'none';
  $('audioResultCard').style.display = 'none';
  $('overviewCard').innerHTML = '<div class="status-line" id="overviewStatus"></div>';
}

async function callApi(path, body){
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع.');
  return data;
}

/* ================= overview ================= */
async function analyzeDocument(){
  setStatus('overviewStatus', '<span class="spinner"></span> جاري التحليل...');
  try{
    const result = await callApi('/analyze', { fileBase64: state.fileBase64, mimeType: state.mimeType });
    renderOverview(result);
  }catch(err){
    setStatus('overviewStatus', 'خطأ: ' + err.message, true);
    throw err;
  }
}

function renderOverview(result){
  const outlineHtml = (result.outline || []).map(o => `<li>${escapeHtml(o)}</li>`).join('');
  $('overviewCard').innerHTML = `
    <h3>${escapeHtml(result.title || state.fileName)}</h3>
    <p class="status-line" style="margin-bottom:18px;">${escapeHtml(result.docType || '')} — ${escapeHtml(result.language || '')}</p>
    <ol class="outline-list">${outlineHtml}</ol>
  `;
  if (result.title) $('sourceLabel').innerHTML = `<span class="dot"></span> ${escapeHtml(result.title)}`;
}

/* ================= summary ================= */
$('summarizeBtn').addEventListener('click', async () => {
  $('summarizeBtn').disabled = true;
  setStatus('summaryStatus', '<span class="spinner"></span> جاري توليد الملخّص...');
  try{
    const level = $('summaryLevel').value;
    const result = await callApi('/summarize', { fileBase64: state.fileBase64, mimeType: state.mimeType, level });
    state.summaryPoints = result.summary || [];
    $('summaryList').innerHTML = state.summaryPoints.map(s => `<li>${escapeHtml(s)}</li>`).join('');
    $('summaryResultCard').style.display = 'block';
    setStatus('summaryStatus', `تم توليد ${state.summaryPoints.length} نقطة.`);
  }catch(err){
    setStatus('summaryStatus', 'خطأ: ' + err.message, true);
  }finally{
    $('summarizeBtn').disabled = false;
  }
});

/* ================= chat ================= */
function addChatMessage(role, text){
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  div.textContent = text;
  $('chatMessages').appendChild(div);
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
}

async function sendChat(){
  const input = $('chatInput');
  const question = input.value.trim();
  if (!question) return;
  addChatMessage('user', question);
  input.value = '';
  $('chatSendBtn').disabled = true;
  setStatus('chatStatus', '<span class="spinner"></span> جاري التفكير...');
  try{
    const result = await callApi('/chat', {
      fileBase64: state.fileBase64, mimeType: state.mimeType,
      question, history: state.chatHistory
    });
    state.chatHistory.push({ role: 'user', text: question });
    state.chatHistory.push({ role: 'assistant', text: result.answer });
    addChatMessage('bot', result.answer);
    setStatus('chatStatus', '');
  }catch(err){
    setStatus('chatStatus', 'خطأ: ' + err.message, true);
  }finally{
    $('chatSendBtn').disabled = false;
  }
}
$('chatSendBtn').addEventListener('click', sendChat);
$('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

/* ================= study guide ================= */
$('studyBtn').addEventListener('click', async () => {
  $('studyBtn').disabled = true;
  setStatus('studyStatus', '<span class="spinner"></span> جاري توليد دليل الدراسة...');
  try{
    const result = await callApi('/study-guide', { fileBase64: state.fileBase64, mimeType: state.mimeType });
    renderStudyGuide(result);
    $('studyResult').style.display = 'block';
    setStatus('studyStatus', 'تم التوليد بنجاح.');
  }catch(err){
    setStatus('studyStatus', 'خطأ: ' + err.message, true);
  }finally{
    $('studyBtn').disabled = false;
  }
});

function renderStudyGuide(result){
  $('tab-terms').innerHTML = (result.keyTerms || []).map(t =>
    `<div class="term-item"><strong>${escapeHtml(t.term)}</strong>${escapeHtml(t.definition)}</div>`
  ).join('');

  $('tab-faq').innerHTML = (result.faq || []).map(f =>
    `<div class="faq-item"><div class="q">${escapeHtml(f.q)}</div><div class="a">${escapeHtml(f.a)}</div></div>`
  ).join('');

  $('tab-quiz').innerHTML = (result.quiz || []).map((q, qi) => `
    <div class="quiz-item">
      <div class="quiz-q">${qi + 1}. ${escapeHtml(q.question)}</div>
      <div class="quiz-opts">
        ${q.options.map((opt, oi) => `<div class="quiz-opt" data-q="${qi}" data-o="${oi}" data-correct="${q.answerIndex}">${escapeHtml(opt)}</div>`).join('')}
      </div>
    </div>
  `).join('');

  $('tab-quiz').querySelectorAll('.quiz-opt').forEach(el => {
    el.addEventListener('click', () => {
      const correct = parseInt(el.dataset.correct, 10);
      const chosen = parseInt(el.dataset.o, 10);
      const siblings = el.parentElement.querySelectorAll('.quiz-opt');
      siblings.forEach(s => s.classList.remove('correct','wrong'));
      siblings[correct].classList.add('correct');
      if (chosen !== correct) el.classList.add('wrong');
    });
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* ================= slides ================= */
$('buildSlidesBtn').addEventListener('click', async () => {
  if (!state.summaryPoints.length){
    setStatus('slidesStatus', 'وَلِّد الملخّص أولًا من تبويب «ملخّص».', true);
    return;
  }
  $('buildSlidesBtn').disabled = true;
  setStatus('slidesStatus', '<span class="spinner"></span> جاري بناء الشرائح...');
  try{
    const result = await callApi('/slides', { points: state.summaryPoints });
    state.slides = result.slides || [];
    state.currentSlide = 0;
    state.audioCache = {};
    renderSlide();
    buildDots();
    $('slideViewer').style.display = 'block';
    setStatus('slidesStatus', `تم إنشاء ${state.slides.length} شريحة.`);
  }catch(err){
    setStatus('slidesStatus', 'خطأ: ' + err.message, true);
  }finally{
    $('buildSlidesBtn').disabled = false;
  }
});

function renderSlide(){
  if (!state.slides.length) return;
  const s = state.slides[state.currentSlide];
  $('slideTitle').textContent = `شريحة ${state.currentSlide + 1} — ${s.title}`;
  $('slideContent').textContent = s.content;
  document.querySelectorAll('.dot').forEach((d,i) => d.classList.toggle('active', i === state.currentSlide));
  stopSlideAudio();
  setStatus('narrationStatus', '');
}

function buildDots(){
  const dotsEl = $('dots');
  dotsEl.innerHTML = '';
  state.slides.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => { state.currentSlide = i; renderSlide(); });
    dotsEl.appendChild(d);
  });
}

$('prevBtn').addEventListener('click', () => { state.currentSlide = (state.currentSlide - 1 + state.slides.length) % state.slides.length; renderSlide(); });
$('nextBtn').addEventListener('click', () => { state.currentSlide = (state.currentSlide + 1) % state.slides.length; renderSlide(); });

function stopSlideAudio(){
  if (currentAudioEl){ currentAudioEl.pause(); currentAudioEl = null; }
  $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
}

$('playBtn').addEventListener('click', async () => {
  if (currentAudioEl && !currentAudioEl.paused){ stopSlideAudio(); return; }
  const idx = state.currentSlide;
  const s = state.slides[idx];

  if (state.audioCache[idx]){
    playCachedAudio(state.audioCache[idx]);
    return;
  }

  setStatus('narrationStatus', '<span class="spinner"></span> جاري توليد الصوت...');
  try{
    const result = await callApi('/tts', { text: `${s.title}. ${s.content}` });
    state.audioCache[idx] = result.audioBase64;
    setStatus('narrationStatus', '');
    playCachedAudio(result.audioBase64);
  }catch(err){
    setStatus('narrationStatus', 'خطأ: ' + err.message, true);
  }
});

function playCachedAudio(base64){
  const audio = new Audio('data:audio/wav;base64,' + base64);
  currentAudioEl = audio;
  $('playIcon').innerHTML = '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>';
  audio.play();
  audio.onended = () => { $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>'; currentAudioEl = null; };
}

/* ================= audio overview ================= */
$('audioOverviewBtn').addEventListener('click', async () => {
  $('audioOverviewBtn').disabled = true;
  setStatus('audioStatus', '<span class="spinner"></span> جاري كتابة الحوار وتوليد الصوت... قد يستغرق هذا دقيقة.');
  try{
    const result = await callApi('/audio-overview', { fileBase64: state.fileBase64, mimeType: state.mimeType });
    $('audioPlayer').src = 'data:audio/wav;base64,' + result.audioBase64;
    $('transcriptBox').textContent = result.transcript;
    $('audioResultCard').style.display = 'block';
    setStatus('audioStatus', 'تم التوليد بنجاح.');
  }catch(err){
    setStatus('audioStatus', 'خطأ: ' + err.message, true);
  }finally{
    $('audioOverviewBtn').disabled = false;
  }
});

/* ================= utils ================= */
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
