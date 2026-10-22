(() => {
  const $ = (id) => document.getElementById(id);
  const docsEl = $('docs-data');
  const historyEl = $('history-data');
  const docs = docsEl ? JSON.parse(docsEl.textContent || '[]') : [];
  const history = historyEl ? JSON.parse(historyEl.textContent || '[]') : [];
  const selected = new Set(docs.map((d) => d.id));
  let busy = false;

  const csrf = () => {
    const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (input && input.value) return input.value;
    return (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (msg) => {
    const tBody = $('toastBody');
    const tEl = $('toast');
    if (tBody && tEl) {
      tBody.textContent = msg;
      bootstrap.Toast.getOrCreateInstance(tEl, { delay: 5000 }).show();
    } else {
      alert(msg);
    }
  };

  /* ── library ───────────────────────────────────────────────── */
  function renderDocs() {
    const list = $('docList');
    if (!list) return;
    list.innerHTML = '';
    docs.forEach((d) => {
      const li = document.createElement('li');
      li.innerHTML = `<input type="checkbox" aria-label="Search ${esc(d.title)}" ${selected.has(d.id) ? 'checked' : ''}>
        <div class="meta"><div class="t" title="${esc(d.title)}">${esc(d.title)}</div>
        <div class="s">${d.kind === 'pdf' ? (d.pages || 1) + ' pages · ' : ''}${d.chunks || 0} passages · ${d.uploaded || ''}</div></div>
        <span class="badge-kind">${(d.kind || 'TXT').toUpperCase()}</span>
        <button class="icon-btn" aria-label="Delete ${esc(d.title)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/></svg></button>`;
      li.querySelector('input').onchange = (e) => { e.target.checked ? selected.add(d.id) : selected.delete(d.id); };
      li.querySelector('button').onclick = () => removeDoc(d);
      list.appendChild(li);
    });
    if ($('docEmpty')) $('docEmpty').hidden = docs.length > 0;
    if ($('libCount')) $('libCount').textContent = docs.length ? `${docs.length} document${docs.length > 1 ? 's' : ''}` : '';
    renderChips();
  }

  async function removeDoc(d) {
    const r = await fetch(`/api/documents/${d.id}/`, { method: 'DELETE', headers: { 'X-CSRFToken': csrf() } });
    if (!r.ok) return toast('Could not delete that document.');
    docs.splice(docs.indexOf(d), 1);
    selected.delete(d.id);
    renderDocs();
  }

  /* ── upload ────────────────────────────────────────────────── */
  async function upload(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    if ($('upState')) $('upState').hidden = false;
    if ($('upText')) $('upText').textContent = `Reading, chunking and indexing ${file.name}…`;
    try {
      const r = await fetch('/api/documents/upload/', { method: 'POST', body: fd, headers: { 'X-CSRFToken': csrf() } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Upload failed.');
      if (data.document) {
        docs.unshift(data.document);
        selected.add(data.document.id);
      }
      renderDocs();
    } catch (e) {
      toast(e.message);
    } finally {
      if ($('upState')) $('upState').hidden = true;
      if ($('fileInput')) $('fileInput').value = '';
    }
  }

  const fileInput = $('fileInput');
  if (fileInput) fileInput.onchange = (e) => upload(e.target.files[0]);

  const drop = $('drop');
  if (drop) {
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => upload(e.dataTransfer.files[0]));
  }

  /* ── chat rendering ────────────────────────────────────────── */
  const thread = $('thread');
  const scrollDown = () => { if (thread) thread.scrollTop = thread.scrollHeight; };
  function add(html, cls) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    $('welcome')?.remove();
    if (thread) thread.appendChild(el);
    scrollDown();
    return el;
  }

  function highlight(text, q) {
    const terms = [...new Set(q.toLowerCase().match(/[a-z0-9]{4,}/g) || [])];
    let out = esc(text);
    terms.forEach((t) => {
      out = out.replace(new RegExp(`\\b(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*)`, 'gi'), '<mark>$1</mark>');
    });
    return out;
  }

  function sourceCards(sources, q, uid) {
    return sources.map((s, i) => `<article class="src" id="${uid}-${i + 1}"><header><b>[${i + 1}] ${esc(s.document)}${s.page ? ' · p. ' + s.page : ''}</b><span>match ${Math.round((s.score || 1) * 100)}%</span></header><p>${highlight(s.passage || s.text || '', q)}</p></article>`).join('');
  }

  function renderAnswer(res, q) {
    const uid = 'a' + Date.now() + Math.floor(Math.random() * 1e3);
    if (!res.found) {
      const near = (res.closest || []).length ? `<button class="src-toggle" type="button">Show closest passages</button><div class="sources" hidden>${sourceCards(res.closest, q, uid)}</div>` : '';
      const el = add(`<div class="body">I couldn’t find this in the uploaded documents.</div>${near}`, 'msg-a nf');
      el.querySelector('.src-toggle')?.addEventListener('click', (e) => {
        const box = el.querySelector('.sources');
        box.hidden = !box.hidden;
        e.target.textContent = box.hidden ? 'Show closest passages' : 'Hide closest passages';
      });
      return;
    }
    const body = esc(res.answer).replace(/\[(\d+)\]/g, (m, n) => `<a class="cite" data-t="${uid}-${n}">${n}</a>`);
    const el = add(`<div class="body">${body}</div><button class="src-toggle" type="button">Hide sources (${res.sources ? res.sources.length : 0})</button><div class="sources">${sourceCards(res.sources || [], q, uid)}</div>`, 'msg-a');
    const box = el.querySelector('.sources');
    const tg = el.querySelector('.src-toggle');
    if (tg && box) {
      tg.onclick = () => {
        box.hidden = !box.hidden;
        tg.textContent = box.hidden ? `Show sources (${res.sources ? res.sources.length : 0})` : `Hide sources (${res.sources ? res.sources.length : 0})`;
      };
    }
    el.querySelectorAll('.cite').forEach((c) => c.onclick = () => {
      if (box && tg) {
        box.hidden = false;
        tg.textContent = `Hide sources (${res.sources ? res.sources.length : 0})`;
      }
      const t = document.getElementById(c.dataset.t);
      if (!t) return;
      t.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      t.classList.add('flash');
      setTimeout(() => t.classList.remove('flash'), 1400);
    });
  }

  async function ask(question) {
    question = question.trim();
    if (!question || busy) return;
    if (!docs.length) return toast('Upload a document first.');
    if (!selected.size) return toast('Select at least one document in the Library.');
    busy = true;
    if ($('send')) $('send').disabled = true;
    if ($('q')) $('q').value = '';
    autosize();
    add(esc(question), 'msg-q');
    const typing = add('<div class="typing" aria-label="Thinking"><i></i><i></i><i></i></div>', 'msg-a');
    try {
      const r = await fetch('/api/ask/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
        body: JSON.stringify({ question, document_ids: [...selected] })
      });
      const data = await r.json().catch(() => ({}));
      typing.remove();
      if (!r.ok) throw new Error(data.error || 'Something went wrong.');
      renderAnswer(data, question);
    } catch (e) {
      typing.remove();
      toast(e.message);
    } finally {
      busy = false;
      if ($('send')) $('send').disabled = false;
      if ($('q')) $('q').focus();
    }
  }

  function renderChips() {
    const c = $('chips');
    if (!c) return;
    c.innerHTML = docs.length ? ['Summarize the main points', 'What are the key terms defined?', 'What conclusions does it draw?'].map((t) => `<button class="chip" type="button">${t}</button>`).join('') : '';
    c.querySelectorAll('.chip').forEach((b) => b.onclick = () => ask(b.textContent));
  }

  const ta = $('q');
  function autosize() {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }
  if (ta) {
    ta.addEventListener('input', autosize);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ask(ta.value);
      }
    });
  }
  if ($('send')) $('send').onclick = () => { if (ta) ask(ta.value); };

  renderDocs();
  history.forEach((h) => {
    add(esc(h.question), 'msg-q');
    renderAnswer({ found: h.found, answer: h.answer, sources: h.sources, closest: [] }, h.question);
  });
})();
