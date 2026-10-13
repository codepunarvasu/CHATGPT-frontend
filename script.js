/* =====================================================================
   ChatGPT-style chat UI
   - Streaming replies from OpenAI-compatible APIs or Anthropic
   - Chats, theme and settings are stored in your browser (localStorage)
   ===================================================================== */

/* ---------- Pure helpers: Markdown -> safe HTML ---------- */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inline(t) {
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0001' + (codes.length - 1) + '\u0001'; });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return t.replace(/\u0001(\d+)\u0001/g, (_, i) => '<code>' + codes[i] + '</code>');
}

function codeBlock(b) {
  return '<div class="code"><div class="code-head"><span>' + escapeHtml(b.lang || 'code') +
    '</span><button class="copy-code" type="button">Copy</button></div><pre><code>' +
    escapeHtml(b.code) + '</code></pre></div>';
}

function tableHtml(rows) {
  const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  let h = '<div class="table-wrap"><table><thead><tr>' +
    head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
  body.forEach(r => { h += '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>'; });
  return h + '</tbody></table></div>';
}

function md(src) {
  const codes = [];
  // Pull out fenced code blocks first (an unclosed fence works while streaming)
  src = src.replace(/```([\w+#.-]*)[^\n]*\n?([\s\S]*?)(?:```|$)/g, (_, lang, code) => {
    codes.push({ lang, code: code.replace(/\n$/, '') });
    return '\n\u0000' + (codes.length - 1) + '\u0000\n';
  });
  const lines = escapeHtml(src).split('\n');
  let out = '', list = null, para = [];
  const flushPara = () => { if (para.length) { out += '<p>' + inline(para.join('<br>')) + '</p>'; para = []; } };
  const closeList = () => { if (list) { out += '</' + list + '>'; list = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    let m;
    if (!line.trim()) { flushPara(); continue; }
    if ((m = line.match(/^\u0000(\d+)\u0000$/))) { flushPara(); closeList(); out += codeBlock(codes[+m[1]]); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(); closeList();
      const n = m[1].length + 1;
      out += '<h' + n + '>' + inline(m[2]) + '</h' + n + '>'; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushPara(); closeList(); out += '<hr>'; continue; }
    if ((m = line.match(/^&gt;\s?(.*)$/))) { flushPara(); closeList(); out += '<blockquote>' + inline(m[1]) + '</blockquote>'; continue; }
    if (/^\|.+\|$/.test(line.trim()) && /^\|?[\s:-]+(\|[\s:-]+)+\|?$/.test((lines[i + 1] || '').trim())) {
      flushPara(); closeList();
      const rows = []; let j = i;
      while (j < lines.length && /^\|.+\|$/.test(lines[j].trim())) { rows.push(lines[j]); j++; }
      i = j - 1; out += tableHtml(rows); continue;
    }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flushPara(); if (list !== 'ul') { closeList(); out += '<ul>'; list = 'ul'; }
      out += '<li>' + inline(m[1]) + '</li>'; continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara(); if (list !== 'ol') { closeList(); out += '<ol>'; list = 'ol'; }
      out += '<li>' + inline(m[1]) + '</li>'; continue;
    }
    closeList(); para.push(line);
  }
  flushPara(); closeList();
  return out;
}
// ---- END PURE ----

/* ---------- Small utilities ---------- */
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
};

const ICON = {
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  regen: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/></svg>'
};

const PRESETS = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' }
};

/* ---------- State ---------- */
const state = {
  chats: store.get('cgpt.chats', []),
  currentId: store.get('cgpt.current', null),
  settings: Object.assign({
    provider: 'openai',
    apiKey: '',
    baseUrl: PRESETS.openai.baseUrl,
    model: PRESETS.openai.model,
    system: 'You are a helpful assistant. Answer clearly and use Markdown when it helps.'
  }, store.get('cgpt.settings', {}))
};
let streaming = false;
let controller = null;

const el = {
  app: $('#app'), thread: $('#thread'), messages: $('#messages'), chatList: $('#chatList'),
  input: $('#input'), send: $('#send'), composer: $('#composer'), search: $('#searchChats'),
  modelName: $('#modelName'), demoNote: $('#demoNote'), toast: $('#toast'), theme: $('#toggleTheme'),
  dlg: $('#settings'), fProvider: $('#fProvider'), fKey: $('#fKey'), fBase: $('#fBase'),
  fModel: $('#fModel'), fSystem: $('#fSystem')
};

const currentChat = () => state.chats.find(c => c.id === state.currentId) || null;
function persist() {
  store.set('cgpt.chats', state.chats);
  store.set('cgpt.current', state.currentId);
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.toast.classList.remove('show'), 2200);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied'); } catch (_) { toast('Copy failed'); }
    ta.remove();
  }
}

/* ---------- Rendering ---------- */
function msgHtml(m, i, isLast) {
  if (m.role === 'user') {
    return '<div class="msg user"><div class="bubble">' + escapeHtml(m.content) + '</div></div>';
  }
  const body = m.content ? md(m.content) : '<div class="typing" aria-label="Thinking"><i></i><i></i><i></i></div>';
  const busy = streaming && isLast;
  const actions = busy ? '' :
    '<div class="actions"><button type="button" data-act="copy" title="Copy" aria-label="Copy reply">' + ICON.copy + '</button>' +
    (isLast ? '<button type="button" data-act="regen" title="Regenerate" aria-label="Regenerate reply">' + ICON.regen + '</button>' : '') +
    '</div>';
  return '<div class="msg assistant' + (m.error ? ' error' : '') + '" data-i="' + i + '"><div class="avatar">' + ICON.spark +
    '</div><div class="body"><div class="md">' + body + '</div>' + actions + '</div></div>';
}

function renderMessages(scroll) {
  const chat = currentChat();
  const has = chat && chat.messages.length > 0;
  el.app.classList.toggle('has-chat', !!has);
  el.messages.innerHTML = has ? chat.messages.map((m, i) => msgHtml(m, i, i === chat.messages.length - 1)).join('') : '';
  if (scroll) el.thread.scrollTop = el.thread.scrollHeight;
}

function renderChatList() {
  const q = el.search.value.trim().toLowerCase();
  const list = state.chats
    .filter(c => !q || c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!list.length) {
    el.chatList.innerHTML = '<div class="none">' + (q ? 'No chats match your search.' : 'No chats yet. Start by typing a message.') + '</div>';
    return;
  }
  el.chatList.innerHTML = '<div class="label">' + (q ? 'Results' : 'Recent') + '</div>' + list.map(c =>
    '<div class="chat-item' + (c.id === state.currentId ? ' active' : '') + '" data-id="' + c.id + '">' +
    '<button type="button" class="open" title="' + escapeHtml(c.title) + '">' + escapeHtml(c.title) + '</button>' +
    '<button type="button" class="del" aria-label="Delete chat" title="Delete chat">' + ICON.trash + '</button></div>'
  ).join('');
}

function renderTopbar() {
  const s = state.settings;
  el.modelName.textContent = s.apiKey ? s.model : 'Demo mode';
  el.demoNote.style.display = s.apiKey ? 'none' : '';
  const dark = document.documentElement.dataset.theme === 'dark';
  el.theme.innerHTML = dark ? ICON.sun : ICON.moon;
  el.theme.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

function renderAll(scroll) { renderChatList(); renderMessages(scroll); }

function nearBottom() { return el.thread.scrollHeight - el.thread.scrollTop - el.thread.clientHeight < 90; }

function updateLast(text) {
  const nodes = el.messages.querySelectorAll('.msg.assistant .md');
  const node = nodes[nodes.length - 1];
  if (!node) return;
  const stick = nearBottom();
  node.innerHTML = md(text);
  if (stick) el.thread.scrollTop = el.thread.scrollHeight;
}

function setStreaming(on) {
  streaming = on;
  el.send.classList.toggle('stop', on);
  el.send.innerHTML = on ? ICON.stop : ICON.send;
  el.send.setAttribute('aria-label', on ? 'Stop generating' : 'Send message');
  el.send.disabled = !on && !el.input.value.trim();
}

function autosize() {
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 200) + 'px';
  if (!streaming) el.send.disabled = !el.input.value.trim();
}

/* ---------- Chats ---------- */
function newChat() {
  const existing = currentChat();
  if (existing && existing.messages.length === 0) return existing; // reuse empty chat
  const chat = { id: uid(), title: 'New chat', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  state.chats.push(chat);
  state.currentId = chat.id;
  persist();
  return chat;
}

function openChat(id) {
  if (streaming) return;
  state.currentId = id;
  persist();
  renderAll(true);
  el.app.classList.remove('open');
}

function deleteChat(id) {
  if (streaming && id === state.currentId) controller && controller.abort();
  state.chats = state.chats.filter(c => c.id !== id);
  if (state.currentId === id) state.currentId = null;
  persist();
  renderAll();
  toast('Chat deleted');
}

/* ---------- Sending & streaming ---------- */
async function send(text) {
  text = text.trim();
  if (!text || streaming) return;
  let chat = currentChat();
  if (!chat) chat = newChat();
  chat.messages.push({ role: 'user', content: text });
  if (chat.messages.length === 1) chat.title = text.replace(/\s+/g, ' ').slice(0, 48);
  chat.updatedAt = Date.now();
  el.input.value = '';
  autosize();
  await respond(chat);
}

async function respond(chat) {
  const reply = { role: 'assistant', content: '' };
  chat.messages.push(reply);
  setStreaming(true);
  renderAll(true);
  controller = new AbortController();
  try {
    const history = chat.messages.slice(0, -1).filter(m => !m.error).map(m => ({ role: m.role, content: m.content }));
    const gen = state.settings.apiKey ? streamApi(history, controller.signal) : streamDemo(history, controller.signal);
    for await (const chunk of gen) { reply.content += chunk; updateLast(reply.content); }
  } catch (err) {
    if (err.name !== 'AbortError') { reply.error = true; reply.content = friendlyError(err); }
  } finally {
    if (!reply.content) chat.messages.pop();  // stopped before any text arrived
    chat.updatedAt = Date.now();
    controller = null;
    setStreaming(false);
    persist();
    renderAll();
  }
}

function friendlyError(err) {
  const msg = String(err && err.message || err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return '**Could not reach the API.** Check your internet connection, the Base URL in Settings, and that this provider allows requests from a browser (CORS).';
  }
  if (/^401|invalid.*key|incorrect api key|authentication/i.test(msg)) {
    return '**The API key was rejected.** Open Settings and check the key.\n\n' + msg;
  }
  if (/^429/.test(msg)) return '**Rate limit or quota reached.** Wait a moment or check your plan.\n\n' + msg;
  return '**Something went wrong.**\n\n' + msg;
}

async function* readSSE(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { yield JSON.parse(data); } catch (e) { /* ignore partial JSON */ }
    }
  }
}

async function* streamApi(history, signal) {
  const s = state.settings;
  const base = s.baseUrl.replace(/\/+$/, '');
  let url, headers, body;
  if (s.provider === 'anthropic') {
    url = base + '/v1/messages';
    headers = {
      'content-type': 'application/json',
      'x-api-key': s.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    body = { model: s.model, max_tokens: 4096, stream: true, messages: history };
    if (s.system) body.system = s.system;
  } else {
    url = base + '/chat/completions';
    headers = { 'content-type': 'application/json', authorization: 'Bearer ' + s.apiKey };
    body = { model: s.model, stream: true, messages: s.system ? [{ role: 'system', content: s.system }, ...history] : history };
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try { const j = JSON.parse(t); msg = (j.error && j.error.message) || j.message || t; } catch (e) { /* keep raw text */ }
    throw new Error(res.status + ': ' + msg);
  }
  for await (const ev of readSSE(res)) {
    if (s.provider === 'anthropic') {
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.text) yield ev.delta.text;
      else if (ev.type === 'error') throw new Error((ev.error && ev.error.message) || 'Stream error');
    } else {
      const d = ev.choices && ev.choices[0] && ev.choices[0].delta && ev.choices[0].delta.content;
      if (d) yield d;
    }
  }
}

// Used when no API key is set, so the UI is fully usable on a public demo page
async function* streamDemo(history, signal) {
  const last = history[history.length - 1].content.replace(/\s+/g, ' ').slice(0, 160);
  const text =
    'You asked:\n\n> ' + last + '\n\nThis is a **demo reply**, because no API key is set yet.\n\n' +
    'To get real answers:\n\n1. Click **Settings & API key** in the sidebar\n2. Pick a provider and paste your key\n3. Save, then ask again\n\n' +
    'Here is a sample code block so you can see the formatting:\n\n```js\nconst greet = name => `Hello, ${name}!`;\nconsole.log(greet("world"));\n```';
  for (const part of text.split(/(\s+)/)) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    yield part;
    await sleep(22);
  }
}

/* ---------- Events ---------- */
el.composer.addEventListener('submit', e => {
  e.preventDefault();
  if (streaming) { controller && controller.abort(); return; }
  send(el.input.value);
});

el.input.addEventListener('input', autosize);
el.input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!streaming) send(el.input.value);
  }
});

$('#newChat').addEventListener('click', () => {
  if (streaming) return;
  newChat(); renderAll(); el.input.focus(); el.app.classList.remove('open');
});

$('#chips').addEventListener('click', e => {
  const b = e.target.closest('button[data-prompt]');
  if (b) send(b.dataset.prompt);
});

el.chatList.addEventListener('click', e => {
  const item = e.target.closest('.chat-item');
  if (!item) return;
  if (e.target.closest('.del')) { if (confirm('Delete this chat?')) deleteChat(item.dataset.id); }
  else openChat(item.dataset.id);
});

el.search.addEventListener('input', renderChatList);

el.messages.addEventListener('click', e => {
  const copyCode = e.target.closest('.copy-code');
  if (copyCode) { copyText(copyCode.closest('.code').querySelector('code').textContent); return; }
  const act = e.target.closest('[data-act]');
  if (!act) return;
  const chat = currentChat();
  if (!chat) return;
  if (act.dataset.act === 'copy') {
    copyText(chat.messages[+act.closest('.msg').dataset.i].content);
  } else if (act.dataset.act === 'regen' && !streaming) {
    chat.messages.pop();
    respond(chat);
  }
});

$('#toggleSide').addEventListener('click', () => {
  if (matchMedia('(max-width: 820px)').matches) el.app.classList.toggle('open');
  else el.app.classList.toggle('collapsed');
});
$('#closeSide').addEventListener('click', () => el.app.classList.remove('open'));
$('#scrim').addEventListener('click', () => el.app.classList.remove('open'));

el.theme.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('cgpt.theme', next);
  renderTopbar();
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); el.search.focus(); }
  if (e.key === 'Escape' && streaming) controller && controller.abort();
});

/* ---------- Settings ---------- */
function openSettings() {
  const s = state.settings;
  el.fProvider.value = s.provider;
  el.fKey.value = s.apiKey;
  el.fBase.value = s.baseUrl;
  el.fModel.value = s.model;
  el.fSystem.value = s.system;
  el.app.classList.remove('open');
  el.dlg.showModal();
}

$('#openSettings').addEventListener('click', openSettings);
$('#modelPill').addEventListener('click', openSettings);
$('#cancelSettings').addEventListener('click', () => el.dlg.close());

el.fProvider.addEventListener('change', () => {
  const p = el.fProvider.value;
  const other = p === 'openai' ? PRESETS.anthropic : PRESETS.openai;
  // Only replace values that are still the other provider's defaults
  if (!el.fBase.value || el.fBase.value === other.baseUrl) el.fBase.value = PRESETS[p].baseUrl;
  if (!el.fModel.value || el.fModel.value === other.model) el.fModel.value = PRESETS[p].model;
});

$('#settingsForm').addEventListener('submit', () => {
  const p = el.fProvider.value;
  state.settings = {
    provider: p,
    apiKey: el.fKey.value.trim(),
    baseUrl: el.fBase.value.trim() || PRESETS[p].baseUrl,
    model: el.fModel.value.trim() || PRESETS[p].model,
    system: el.fSystem.value.trim()
  };
  store.set('cgpt.settings', state.settings);
  renderTopbar();
  toast(state.settings.apiKey ? 'Settings saved' : 'Saved. No key set, so replies stay in demo mode');
});

$('#clearAll').addEventListener('click', () => {
  if (!confirm('Delete all chats? This cannot be undone.')) return;
  if (streaming) controller && controller.abort();
  state.chats = []; state.currentId = null;
  persist(); renderAll(); el.dlg.close(); toast('All chats deleted');
});

/* ---------- Init ---------- */
if (!currentChat()) state.currentId = null;
setStreaming(false);
renderTopbar();
renderAll(true);
autosize();
