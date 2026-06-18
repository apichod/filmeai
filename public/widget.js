(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var API_URL = script.getAttribute('data-api-url') || 'https://filmeai.vercel.app/api/chat';
  var CATALOG_SEARCH_URL = script.getAttribute('data-catalog-url') || (function () {
    try { return new URL('/api/catalog-search', API_URL).toString(); }
    catch (e) { return 'https://filmeai.vercel.app/api/catalog-search'; }
  })();
  var CATALOG_SIGNALS_URL = script.getAttribute('data-signals-url') || (function () {
    try { return new URL('/api/catalog-signals', API_URL).toString(); }
    catch (e) { return 'https://filmeai.vercel.app/api/catalog-signals'; }
  })();
  var WIDGET_SETTINGS_URL = script.getAttribute('data-settings-url') || (function () {
    try { return new URL('/api/widget-settings', API_URL).toString(); }
    catch (e) { return 'https://filmeai.vercel.app/api/widget-settings'; }
  })();
  var ORG_ID = script.getAttribute('data-org-id') || '';
  var DEFAULT_GREETING = "Bonjour ! 👋 Je suis l'assistant FilmeAI de Filme, votre loueur de matériel audiovisuel.\n\nJe peux vous préparer un devis en quelques minutes. Pour commencer, pourriez-vous me donner votre prénom et nom ?";
  var configuredGreeting = DEFAULT_GREETING;

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
      border-top: 1px solid #e5e7eb; padding: 10px 12px 8px;
    }
    #filmeai-input-row {
      display: flex; gap: 8px; align-items: flex-end;
    }
    #filmeai-input {
      flex: 1; border: 1.5px solid #e5e7eb; border-radius: 10px;
      padding: 9px 12px; font-size: 13.5px; resize: none; outline: none;
      min-height: 58px; max-height: 120px; line-height: 1.45; color: #111;
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
    #filmeai-input-help {
      margin-top: 6px; color: #9ca3af; font-size: 10.5px; line-height: 1.2;
      padding-left: 2px; user-select: none;
    }
    .filmeai-products { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
    .filmeai-product-card {
      background: white; border: 1px solid #e5e7eb; border-radius: 10px;
      padding: 10px 12px; font-size: 12.5px; color: #111;
    }
    .filmeai-product-name { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
    .filmeai-product-price { color: #555; }
    .filmeai-match-list { max-width: 96%; align-self: flex-start; display: flex; flex-direction: column; gap: 10px; }
    .filmeai-match-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 13px; padding: 11px; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
    .filmeai-match-card.strong { border-color: #bbf7d0; background: #f7fee7; }
    .filmeai-match-card.uncertain { border-color: #fde68a; background: #fffbeb; }
    .filmeai-match-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .filmeai-requested { font-size:12px; color:#6b7280; margin-bottom:4px; }
    .filmeai-selected-name { font-size:13px; font-weight:700; color:#111827; line-height:1.35; }
    .filmeai-pack-label { display:inline-block; margin-left:6px; padding:1px 6px; border-radius:999px; background:#111827; color:#fff; font-size:9px; font-weight:700; letter-spacing:.08em; vertical-align:middle; }
    .filmeai-bundle-items { margin-top:4px; color:#6b7280; font-size:11px; line-height:1.35; }
    .filmeai-human-required { margin-top:4px; color:#b45309; font-size:11px; font-weight:700; }
    .filmeai-card-actions { display:flex; flex-direction:column; gap:5px; flex-shrink:0; }
    .filmeai-action-line { width:24px; height:24px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; color:#9ca3af; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:15px; line-height:1; }
    .filmeai-action-line:hover { color:#111; border-color:#111; }
    .filmeai-options { display:flex; flex-direction:column; gap:6px; margin-top:9px; }
    .filmeai-edit-choices { display:grid; grid-template-columns:1fr; gap:6px; margin-top:9px; }
    .filmeai-manual-search { margin-top:7px; display:flex; flex-direction:column; gap:6px; }
    .filmeai-manual-input { width:100%; border:1px solid #e5e7eb; border-radius:9px; padding:8px 9px; font-size:12px; outline:none; background:#fff; color:#111827; }
    .filmeai-manual-input:focus { border-color:#111827; }
    .filmeai-search-status { color:#6b7280; font-size:11px; }
    .filmeai-option-btn { text-align:left; border:1px solid #e5e7eb; background:white; border-radius:9px; padding:8px 9px; cursor:pointer; font-size:12px; color:#111827; line-height:1.35; }
    .filmeai-option-btn:hover { border-color:#111; }
    .filmeai-option-btn.selected { border-color:#111; background:#111; color:white; }
    .filmeai-option-price { color:#6b7280; font-size:11px; }
    .filmeai-option-btn.selected .filmeai-option-price { color:rgba(255,255,255,.68); }
    .filmeai-confirm-hint { font-size:12px; color:#6b7280; padding:8px 2px 0; }
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
        <div id="filmeai-input-row">
          <textarea id="filmeai-input" placeholder="Écrivez votre message…" rows="2"></textarea>
          <button id="filmeai-send" disabled title="Envoyer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div id="filmeai-input-help">Entrée : retour ligne · ⌘/Ctrl + Entrée : envoyer</div>
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
  var storageKey = 'filmeai_session_' + (ORG_ID || 'default');
  var savedSession = {};
  try { savedSession = JSON.parse(window.localStorage.getItem(storageKey) || '{}') || {}; } catch (e) { savedSession = {}; }
  var sessionData = {
    customerName: savedSession.customerName || null,
    customerEmail: savedSession.customerEmail || null,
    customerPhone: savedSession.customerPhone || null,
    startsAt: savedSession.startsAt || null,
    stopsAt: savedSession.stopsAt || null,
    selectedProductIds: savedSession.selectedProductIds || [],
    conversationId: savedSession.conversationId || null,
    quoteMode: savedSession.quoteMode || null,
    quoteMatches: savedSession.quoteMatches || []
  };
  var typingEl = null;
  var matchListEl = null;
  var manualSearchTimer = null;

  var panel = document.getElementById('filmeai-panel');
  var bubble = document.getElementById('filmeai-bubble');
  var closeBtn = document.getElementById('filmeai-close');
  var messagesEl = document.getElementById('filmeai-messages');
  var input = document.getElementById('filmeai-input');
  var sendBtn = document.getElementById('filmeai-send');

  fetch(WIDGET_SETTINGS_URL)
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(settings) {
      if (!settings) return;
      if (settings.greeting_message && String(settings.greeting_message).trim()) {
        configuredGreeting = String(settings.greeting_message).trim();
      }
      if (settings.assistant_name && String(settings.assistant_name).trim()) {
        var title = document.getElementById('filmeai-header-title');
        if (title) title.innerHTML = formatMarkdown(String(settings.assistant_name).trim());
      }
      if (settings.primary_color && /^#[0-9a-f]{6}$/i.test(String(settings.primary_color))) {
        var primary = String(settings.primary_color);
        document.getElementById('filmeai-header').style.background = primary;
        document.getElementById('filmeai-send').style.background = primary;
        document.getElementById('filmeai-bubble').style.background = primary;
      }
    })
    .catch(function() {});

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
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!sendBtn.disabled) send();
    }
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

  function escapeAttr(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
    var greeting = configuredGreeting || DEFAULT_GREETING;
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
    if (/^faire un devis$/i.test(text.trim())) {
      sessionData.quoteMode = 'immediate';
    }

    // Simple email detection
    var emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) sessionData.customerEmail = emailMatch[0];

    // Phone detection
    var phoneMatch = text.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
    if (phoneMatch) sessionData.customerPhone = phoneMatch[0];

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

    persistSession();
  }

  function persistSession() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(sessionData));
    } catch (e) {}
  }

  function isBundle(product) {
    return !!(product && (product.is_bundle || /\bpack\b/i.test(product.name || '') || (product.bundle_items || []).length));
  }

  function bundleText(product) {
    var items = (product && product.bundle_items) || [];
    if (!items.length) return '';
    return 'Contenu : ' + items.slice(0, 5).join(', ') + (items.length > 5 ? '…' : '');
  }

  function updateSelectedProductIds() {
    var ids = [];
    (sessionData.quoteMatches || []).forEach(function(item) {
      if (item.selectedProductId && ids.indexOf(item.selectedProductId) === -1) ids.push(item.selectedProductId);
    });
    sessionData.selectedProductIds = ids;
    persistSession();
  }

  function candidateChoices(item) {
    var choices = [];
    if (item.matched) choices.push(item.matched);
    (item.alternatives || []).forEach(function(product) { choices.push(product); });
    (item.manualResults || []).forEach(function(product) { choices.push(product); });
    var seen = {};
    return choices.filter(function(product) {
      var key = product && (product.id || (product.name || '').toLowerCase());
      var nameKey = product && (product.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!product || seen[key] || seen['name:' + nameKey]) return false;
      seen[key] = true;
      seen['name:' + nameKey] = true;
      return true;
    }).slice(0, 3);
  }

  function findChoice(item, productId) {
    return candidateChoices(item).filter(function(product) { return product.id === productId; })[0] || null;
  }

  function displayProductName(product) {
    return String((product && product.name) || 'Produit à confirmer')
      .replace(/\bFX([369])0\b/g, 'FX$1')
      .replace(/\b(RX\s*750)0\b/gi, '$1')
      .replace(/\b(RX\s*1500)0\b/gi, '$1');
  }

  function recordCatalogSignal(item, product) {
    if (!item || !product) return;
    var term = String(item.requestedName || item.searchQuery || '').trim();
    var productName = displayProductName(product).trim();
    if (!term || !productName || term.toLowerCase() === productName.toLowerCase()) return;

    try {
      fetch(CATALOG_SIGNALS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: term,
          productId: product.id || null,
          productName: productName,
          source: 'chat_manual'
        })
      }).catch(function() {});
    } catch (e) {}
  }

  function searchCatalogForMatch(index, query) {
    var item = sessionData.quoteMatches[index];
    if (!item) return;
    item.manualQuery = query;
    item.manualLoading = false;
    item.manualResults = [];

    if (manualSearchTimer) window.clearTimeout(manualSearchTimer);
    if (!query || query.trim().length < 2) {
      renderQuoteMatches();
      return;
    }

    item.manualLoading = true;

    manualSearchTimer = window.setTimeout(function() {
      fetch(CATALOG_SEARCH_URL + '?q=' + encodeURIComponent(query.trim()))
        .then(function(res) { return res.ok ? res.json() : []; })
        .then(function(results) {
          var current = sessionData.quoteMatches[index];
          if (!current) return;
          current.manualLoading = false;
          current.manualResults = Array.isArray(results) ? results.slice(0, 5) : [];
          renderQuoteMatches();
        })
        .catch(function() {
          var current = sessionData.quoteMatches[index];
          if (!current) return;
          current.manualLoading = false;
          current.manualResults = [];
          renderQuoteMatches();
        });
    }, 280);
  }

  function initQuoteMatches(items) {
    sessionData.quoteMatches = (items || []).map(function(item, index) {
      var selectedProductId = item.matched && item.confidence >= 0.8 ? item.matched.id : null;
      return Object.assign({}, item, {
        clientIndex: index,
        selectedProductId: selectedProductId,
        leaveToFilme: false
      });
    });
    updateSelectedProductIds();
  }

  function renderProductName(product) {
    return formatMarkdown(displayProductName(product)) + (isBundle(product) ? '<span class="filmeai-pack-label">PACK</span>' : '');
  }

  function renderQuoteMatches() {
    var items = sessionData.quoteMatches || [];
    if (matchListEl && matchListEl.parentNode) matchListEl.remove();
    if (!items.length) return;

    var wrap = document.createElement('div');
    wrap.className = 'filmeai-match-list';
    matchListEl = wrap;

    items.forEach(function(item, index) {
      var strong = item.selectedProductId && (item.confidence >= 0.8 || item.userResolved);
      var selectedProduct = item.selectedProductId ? findChoice(item, item.selectedProductId) || item.matched : null;
      var card = document.createElement('div');
      card.className = 'filmeai-match-card ' + (strong ? 'strong' : 'uncertain');

      var html = '';
      html += '<div class="filmeai-match-top"><div style="min-width:0;flex:1">';
      html += '<div class="filmeai-requested">' + (item.section ? formatMarkdown(item.section) + ' · ' : '') + formatMarkdown(String(item.quantity || 1)) + '× demandé : ' + formatMarkdown(item.requestedName || item.searchQuery || '') + '</div>';

      if (selectedProduct) {
        html += '<div class="filmeai-selected-name">' + renderProductName(selectedProduct) + '</div>';
        html += '<div class="filmeai-option-price">Produit catalogue — prix après dates</div>';
        if (isBundle(selectedProduct) && bundleText(selectedProduct)) html += '<div class="filmeai-bundle-items">' + formatMarkdown(bundleText(selectedProduct)) + '</div>';
      } else if (item.leaveToFilme) {
        html += '<div class="filmeai-selected-name">L’équipe Filme me fera une proposition</div>';
        html += '<div class="filmeai-human-required">Intervention humaine demandée</div>';
      } else {
        html += '<div class="filmeai-selected-name">Correspondance catalogue à vérifier</div>';
        html += '<div class="filmeai-human-required">Intervention humaine requise</div>';
      }

      html += '</div><div class="filmeai-card-actions">';
      html += '<button class="filmeai-action-line" data-action="remove" data-index="' + index + '" title="Supprimer">×</button>';
      html += '<button class="filmeai-action-line" data-action="edit" data-index="' + index + '" title="Modifier">✎</button>';
      html += '</div></div>';

      if (item.editing) {
        var baseChoices = candidateChoices(item);
        if (selectedProduct) {
          html += '<div class="filmeai-edit-choices">';
          html += '<button class="filmeai-option-btn selected" data-action="noop" data-index="' + index + '">';
          html += renderProductName(selectedProduct);
          html += '<div class="filmeai-option-price">Choix retenu</div>';
          if (isBundle(selectedProduct) && bundleText(selectedProduct)) html += '<div class="filmeai-bundle-items">' + formatMarkdown(bundleText(selectedProduct)) + '</div>';
          html += '</button>';
          html += '</div>';
        } else if (baseChoices.length) {
          html += '<div class="filmeai-options">';
          baseChoices.forEach(function(product) {
            var selected = item.selectedProductId === product.id;
            html += '<button class="filmeai-option-btn ' + (selected ? 'selected' : '') + '" data-action="choose" data-index="' + index + '" data-product-id="' + product.id + '">';
            html += renderProductName(product);
            html += '<div class="filmeai-option-price">Produit catalogue</div>';
            if (isBundle(product) && bundleText(product)) html += '<div class="filmeai-bundle-items">' + formatMarkdown(bundleText(product)) + '</div>';
            html += '</button>';
          });
          html += '</div>';
        }

        html += '<div class="filmeai-edit-choices">';
        html += '<button class="filmeai-option-btn" data-action="manual" data-index="' + index + '">Faire une recherche manuelle…</button>';
        html += '<button class="filmeai-option-btn ' + (item.leaveToFilme ? 'selected' : '') + '" data-action="filme" data-index="' + index + '">Laisser Filme me faire une proposition</button>';
        html += '</div>';

        if (item.manualSearchOpen) {
          html += '<div class="filmeai-manual-search">';
          html += '<input class="filmeai-manual-input" data-action="manual-query" data-index="' + index + '" value="' + escapeAttr(item.manualQuery || '') + '" placeholder="Rechercher dans le catalogue Filme…" />';
          if (item.manualLoading) html += '<div class="filmeai-search-status">Recherche…</div>';
          (item.manualResults || []).forEach(function(product) {
            var selected = item.selectedProductId === product.id;
            html += '<button class="filmeai-option-btn ' + (selected ? 'selected' : '') + '" data-action="choose" data-index="' + index + '" data-product-id="' + product.id + '">';
            html += renderProductName(product);
            html += '<div class="filmeai-option-price">Produit catalogue</div>';
            if (isBundle(product) && bundleText(product)) html += '<div class="filmeai-bundle-items">' + formatMarkdown(bundleText(product)) + '</div>';
            html += '</button>';
          });
          html += '</div>';
        }
      }

      card.innerHTML = html;
      wrap.appendChild(card);
    });

    var hint = document.createElement('div');
    hint.className = 'filmeai-confirm-hint';
    hint.textContent = 'Quand la liste vous convient, écrivez “je confirme” pour créer le devis.';
    wrap.appendChild(hint);

    wrap.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.getAttribute('data-action');
      var index = parseInt(target.getAttribute('data-index'), 10);
      var item = sessionData.quoteMatches[index];
      if (!item) return;

      if (action === 'remove') {
        sessionData.quoteMatches.splice(index, 1);
      } else if (action === 'edit') {
        item.editing = !item.editing;
      } else if (action === 'choose') {
        item.selectedProductId = target.getAttribute('data-product-id');
        recordCatalogSignal(item, findChoice(item, item.selectedProductId) || item.matched);
        item.userResolved = true;
        item.leaveToFilme = false;
        item.editing = false;
      } else if (action === 'filme') {
        item.selectedProductId = null;
        item.userResolved = true;
        item.leaveToFilme = true;
        item.editing = false;
      } else if (action === 'manual') {
        item.manualSearchOpen = !item.manualSearchOpen;
        if (item.manualSearchOpen) {
          item.manualQuery = '';
          item.manualResults = [];
          item.manualLoading = false;
        }
      }

      updateSelectedProductIds();
      renderQuoteMatches();
      if (action === 'manual' && item.manualSearchOpen) {
        window.setTimeout(function() {
          var manualInput = messagesEl.querySelector('.filmeai-manual-input[data-index="' + index + '"]');
          if (manualInput) manualInput.focus();
        }, 0);
      }
    });

    wrap.addEventListener('input', function(e) {
      var target = e.target.closest('[data-action="manual-query"]');
      if (!target) return;
      var index = parseInt(target.getAttribute('data-index'), 10);
      searchCatalogForMatch(index, target.value || '');
    });

    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
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
    var receivedQuoteMatchItems = false;

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
      } else if (evt.type === 'progress') {
        if (!botEl) { hideTyping(); botEl = addMessage('bot', ''); }
        if (evt.message && botContent.indexOf(evt.message) === -1) {
          botContent += '\n\n' + evt.message;
          botEl.innerHTML = formatMarkdown(botContent);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      } else if (evt.type === 'products') {
        sessionData.selectedProductIds = (evt.products || []).map(function(p) { return p.id; });
        persistSession();
      } else if (evt.type === 'quote_matches') {
        initQuoteMatches(evt.items || []);
        renderQuoteMatches();
      } else if (evt.type === 'quote_match_item') {
        if (!receivedQuoteMatchItems) {
          receivedQuoteMatchItems = true;
          sessionData.quoteMatches = [];
          if (matchListEl && matchListEl.parentNode) matchListEl.remove();
          matchListEl = null;
        }
        if (evt.item) {
          var item = evt.item;
          item.clientIndex = typeof evt.index === 'number' ? evt.index : sessionData.quoteMatches.length;
          item.selectedProductId = item.matched && item.confidence >= 0.8 ? item.matched.id : null;
          item.leaveToFilme = false;
          sessionData.quoteMatches.push(item);
          updateSelectedProductIds();
          renderQuoteMatches();
        }
      } else if (evt.type === 'quote_matches_done') {
        persistSession();
      } else if (evt.type === 'creating_quote') {
        if (botEl) botContent += '\n\n⏳ Création du devis en cours…';
        if (botEl) botEl.innerHTML = formatMarkdown(botContent);
      } else if (evt.type === 'quote_created') {
        sessionData.orderId = evt.orderId;
        persistSession();
      } else if (evt.type === 'conversation_saved') {
        if (evt.conversationId) sessionData.conversationId = evt.conversationId;
        persistSession();
      } else if (evt.type === 'conversation_save_error') {
        console.warn('FilmeAI conversation save error:', evt.message);
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
