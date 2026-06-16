(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var API_URL = script.getAttribute('data-api-url') || 'https://filmeai.vercel.app/api/chat';
  var ORG_ID = script.getAttribute('data-org-id') || '';

  // ── Styles ─────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = `
    #filmeai-widget * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #filmeai-bubble {
      position: fixed; bottom: 24px; right: 24px; z-index: 999999;
      width: 56px; height: 56px; border-radius: 50%;
      background: #000; border: none; cursor: pointer;
      box-shadow: 0 4px 24px rgba(0,0,0,0.25);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #filmeai-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 32px rgba(0,0,0,0.35); }
    #filmeai-bubble svg { width: 26px; height: 26px; fill: white; }
    #filmeai-panel {
      position: fixed; bottom: 92px; right: 24px; z-index: 999998;
      width: 360px; height: 520px; border-radius: 16px;
      background: white; box-shadow: 0 8px 40px rgba(0,0,0,0.18);
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(0.92) translateY(12px); opacity: 0;
      transition: transform 0.22s cubic-bezier(.34,1.56,.64,1), opacity 0.18s;
      pointer-events: none;
    }
    #filmeai-panel.open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }
    #filmeai-header {
      background: #000; padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between;
    }
    #filmeai-header-title { color: white; font-size: 15px; font-weight: 500; letter-spacing: 0.02em; }
    #filmeai-header-title span { font-weight: 700; }
    #filmeai-close { background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.6); padding: 4px; line-height: 1; font-size: 20px; }
    #filmeai-close:hover { color: white; }
    #filmeai-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 10px; scroll-behavior: smooth;
    }
    .filmeai-msg {
      max-width: 82%; padding: 10px 13px; border-radius: 14px;
      font-size: 13.5px; line-height: 1.5; white-space: pre-wrap;
    }
    .filmeai-msg.bot {
      background: #f3f4f6; color: #111; align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .filmeai-msg.user {
      background: #000; color: white; align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .filmeai-msg strong { font-weight: 600; }
    .filmeai-typing { display: flex; gap: 4px; padding: 12px 14px; align-items: center; }
    .filmeai-dot { width: 7px; height: 7px; border-radius: 50%; background: #aaa; animation: filmeai-bounce 1.2s infinite; }
    .filmeai-dot:nth-child(2) { animation-delay: 0.2s; }
    .filmeai-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes filmeai-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
    #filmeai-input-area {
      border-top: 1px solid #e5e7eb; padding: 12px;
      display: flex; gap: 8px; align-items: flex-end;
    }
    #filmeai-input {
      flex: 1; border: 1.5px solid #e5e7eb; border-radius: 10px;
      padding: 9px 12px; font-size: 13.5px; resize: none; outline: none;
      max-height: 100px; line-height: 1.45; color: #111;
      transition: border-color 0.15s;
    }
    #filmeai-input:focus { border-color: #000; }
    #filmeai-send {
      width: 36px; height: 36px; border-radius: 10px;
      background: #000; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: opacity 0.15s;
    }
    #filmeai-send:disabled { opacity: 0.35; cursor: not-allowed; }
    #filmeai-send svg { width: 16px; height: 16px; fill: white; }
    .filmeai-products { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
    .filmeai-product-card {
      background: white; border: 1px solid #e5e7eb; border-radius: 10px;
      padding: 10px 12px; font-size: 12.5px; color: #111;
    }
    .filmeai-product-name { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
    .filmeai-product-price { color: #555; }
    @media (max-width: 400px) {
      #filmeai-panel { width: calc(100vw - 24px); right: 12px; bottom: 84px; }
    }
  `;
  document.head.appendChild(style);

  // ── HTML ───────────────────────────────────────────────────────────────────
  var widget = document.createElement('div');
  widget.id = 'filmeai-widget';
  widget.innerHTML = `
    <div id="filmeai-panel">
      <div id="filmeai-header">
        <div id="filmeai-header-title">filme<span>AI</span> · Assistant devis</div>
        <button id="filmeai-close" title="Fermer">×</button>
      </div>
      <div id="filmeai-messages"></div>
      <div id="filmeai-input-area">
        <textarea id="filmeai-input" placeholder="Écrivez votre message…" rows="1"></textarea>
        <button id="filmeai-send" disabled>
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
    <button id="filmeai-bubble" title="Assistant FilmeAI">
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
    </button>
  `;
  document.body.appendChild(widget);

  // ── State ──────────────────────────────────────────────────────────────────
  var isOpen = false;
  var isLoading = false;
  var messages = []; // {role, content}
  var sessionData = { customerName: null, customerEmail: null, startsAt: null, stopsAt: null, selectedProductIds: [], conversationId: null };
  var typingEl = null;

  var panel = document.getElementById('filmeai-panel');
  var bubble = document.getElementById('filmeai-bubble');
  var closeBtn = document.getElementById('filmeai-close');
  var messagesEl = document.getElementById('filmeai-messages');
  var input = document.getElementById('filmeai-input');
  var sendBtn = document.getElementById('filmeai-send');

  // ── Toggle ─────────────────────────────────────────────────────────────────
  function toggle() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    if (isOpen && messages.length === 0) sendBotGreeting();
  }
  bubble.addEventListener('click', toggle);
  closeBtn.addEventListener('click', toggle);

  // ── Input handling ─────────────────────────────────────────────────────────
  input.addEventListener('input', function () {
    sendBtn.disabled = !input.value.trim() || isLoading;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) send(); }
  });
  sendBtn.addEventListener('click', send);

  // ── Message rendering ──────────────────────────────────────────────────────
  function addMessage(role, content) {
    var el = document.createElement('div');
    el.className = 'filmeai-msg ' + role;
    el.innerHTML = formatMarkdown(content);
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function formatMarkdown(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function showTyping() {
    typingEl = document.createElement('div');
    typingEl.className = 'filmeai-msg bot filmeai-typing';
    typingEl.innerHTML = '<div class="filmeai-dot"></div><div class="filmeai-dot"></div><div class="filmeai-dot"></div>';
    messagesEl.appendChild(typingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }

  // ── Send greeting ──────────────────────────────────────────────────────────
  function sendBotGreeting() {
    var greeting = "Bonjour ! 👋 Je suis l'assistant FilmeAI de Filme, votre loueur de matériel audiovisuel.\n\nJe peux vous préparer un devis en quelques minutes. Pour commencer, pourriez-vous me donner votre prénom et nom ?";
    addMessage('bot', greeting);
    messages.push({ role: 'assistant', content: greeting });
  }

  // ── Send user message ──────────────────────────────────────────────────────
  function send() {
    var text = input.value.trim();
    if (!text || isLoading) return;

    addMessage('user', text);
    messages.push({ role: 'user', content: text });

    // Try to extract session data from conversation
    extractSessionData(text);

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    isLoading = true;
    showTyping();
    streamResponse();
  }

  function extractSessionData(text) {
    // Simple email detection
    var emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) sessionData.customerEmail = emailMatch[0];

    // Date detection (DD/MM/YYYY or similar)
    var dateMatches = text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g);
    if (dateMatches && dateMatches.length >= 1) {
      sessionData.startsAt = parseDate(dateMatches[0]);
      if (dateMatches.length >= 2) sessionData.stopsAt = parseDate(dateMatches[1]);
    }

    // Name detection: if first bot message was asking for name and user replied
    if (!sessionData.customerName && messages.length <= 3 && text.length < 50 && !emailMatch) {
      sessionData.customerName = text;
    }
  }

  function parseDate(str) {
    var parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      var day = parseInt(parts[0]), month = parseInt(parts[1]) - 1, year = parseInt(parts[2]);
      if (year < 100) year += 2000;
      return new Date(year, month, day).toISOString();
    }
    return null;
  }

  // ── Stream response from API ──────────────────────────────────────────────
  function streamResponse() {
    var botEl = null;
    var botContent = '';

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages, sessionData: sessionData }),
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function read() {
        return reader.read().then(function (result) {
          if (result.done) {
            hideTyping();
            isLoading = false;
            sendBtn.disabled = false;
            input.focus();
            if (botContent) messages.push({ role: 'assistant', content: botContent });
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();

          lines.forEach(function (line) {
            if (!line.startsWith('data: ')) return;
            try {
              var evt = JSON.parse(line.slice(6));
              handleEvent(evt);
            } catch (e) {}
          });

          return read();
        });
      }
      return read();
    })
    .catch(function (err) {
      hideTyping();
      isLoading = false;
      sendBtn.disabled = false;
      addMessage('bot', "Désolé, je rencontre une difficulté. Réessayez ou contactez bonjour@filme.fr");
      console.error('FilmeAI error:', err);
    });

    function handleEvent(evt) {
      if (evt.type === 'delta') {
        if (!botEl) { hideTyping(); botEl = addMessage('bot', ''); }
        botContent += evt.content;
        botEl.innerHTML = formatMarkdown(botContent);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (evt.type === 'searching') {
        if (!botEl) { hideTyping(); botEl = addMessage('bot', '🔍 Recherche dans notre catalogue…'); }
      } else if (evt.type === 'products') {
        sessionData.selectedProductIds = (evt.products || []).map(function(p) { return p.id; });
      } else if (evt.type === 'creating_quote') {
        if (botEl) botContent += '\n\n⏳ Création du devis en cours…';
        if (botEl) botEl.innerHTML = formatMarkdown(botContent);
      } else if (evt.type === 'quote_created') {
        sessionData.orderId = evt.orderId;
      } else if (evt.type === 'conversation_saved') {
        if (evt.conversationId) sessionData.conversationId = evt.conversationId;
      } else if (evt.type === 'done') {
        hideTyping();
        isLoading = false;
        sendBtn.disabled = false;
        input.focus();
        if (botContent) messages.push({ role: 'assistant', content: botContent });
        botEl = null;
        botContent = '';
      } else if (evt.type === 'error') {
        hideTyping();
        addMessage('bot', evt.message || 'Une erreur est survenue.');
        isLoading = false;
        sendBtn.disabled = false;
      }
    }
  }
})();
