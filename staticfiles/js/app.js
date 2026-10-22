(() => {
    'use strict';

    /* ───────────── Config ───────────── */
    const API = { upload: '/api/upload/', ask: '/api/ask/' };
    const NOT_FOUND = 'information could not be found in the uploaded document';
    const MAX_PILLS = 48;
    const ALLOWED = ['pdf', 'txt'];
    const SUGGESTIONS = [
        { icon: 'list-checks', text: 'Summarize this document in five key points' },
        { icon: 'search-check', text: 'What are the main conclusions or findings?' },
        { icon: 'calendar-range', text: 'List the important names, dates, and figures mentioned' },
    ];

    /* ───────────── State & DOM ───────────── */
    const $ = (id) => document.getElementById(id);
    const el = {
        dropzone: $('dropzone'), fileInput: $('fileInput'), dzIdle: $('dzIdle'), dzBusy: $('dzBusy'), busyTitle: $('busyTitle'),
        fileCard: $('fileCard'), fileName: $('fileName'), fileMeta: $('fileMeta'), fileIcon: $('fileIcon'), replaceBtn: $('replaceBtn'),
        chunkToggle: $('chunkToggle'), chunkPanel: $('chunkPanel'), chunkPills: $('chunkPills'), chunkPreview: $('chunkPreview'), chunkChevron: $('chunkChevron'),
        headerDoc: $('headerDoc'), clearBtn: $('clearBtn'), chatScroll: $('chatScroll'), stream: $('stream'), emptyState: $('emptyState'),
        input: $('input'), sendBtn: $('sendBtn'), toastHost: $('toastHost'),
        statusDot: $('statusDot'), statusPing: $('statusPing'), statusText: $('statusText'), statusSub: $('statusSub'),
    };

    const state = {
        doc: null,            // { filename, chunkCount, size }
        chunks: new Map(),    // chunk_id -> { page, text } (learned from retrieved sources)
        activeChunk: null,
        uploading: false,
        busy: false,
    };

    /* ───────────── Utilities ───────────── */
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const icons = () => window.lucide && window.lucide.createIcons();
    const icon = (name, cls = 'h-4 w-4') => `<i data-lucide="${name}" class="${cls}"></i>`;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    const formatBytes = (n) => {
        if (!Number.isFinite(n)) return '';
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1024 / 1024).toFixed(1)} MB`;
    };

    const getCsrf = () => {
        const field = document.querySelector('input[name="csrfmiddlewaretoken"]');
        if (field && field.value) return field.value;
        const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    };

    const scrollToBottom = (smooth = true) => {
        requestAnimationFrame(() => el.chatScroll.scrollTo({ top: el.chatScroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
    };

    const readError = async (res) => {
        try {
            const data = await res.json();
            return data.error || data.message || data.detail || `Request failed (${res.status})`;
        } catch {
            return `Request failed (${res.status})`;
        }
    };

    /* ───────────── Status badge ───────────── */
    function setStatus(online) {
        el.statusDot.className = `relative inline-flex h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`;
        el.statusPing.className = `absolute inline-flex h-full w-full rounded-full ${online ? 'animate-ping bg-emerald-400/60' : 'bg-amber-400/40'}`;
        el.statusText.textContent = online ? 'Connected to RAG Engine' : 'RAG Engine unreachable';
        el.statusSub.textContent = online ? 'FAISS vector index active' : 'Check that the Django server is running on port 8000';
    }

    /* ───────────── Toasts ───────────── */
    function toast(message, type = 'success') {
        const tones = {
            success: ['check-circle-2', 'text-emerald-300', 'border-emerald-400/20'],
            error: ['circle-alert', 'text-rose-300', 'border-rose-400/20'],
            info: ['info', 'text-violet-300', 'border-violet-400/20'],
        }[type];
        const node = document.createElement('div');
        node.className = `toast pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border ${tones[2]} bg-zinc-900/95 px-4 py-3 text-sm text-zinc-100 shadow-2xl shadow-black/40 backdrop-blur`;
        node.innerHTML = `${icon(tones[0], `mt-0.5 h-4 w-4 shrink-0 ${tones[1]}`)}<span>${esc(message)}</span>`;
        el.toastHost.appendChild(node);
        icons();
        setTimeout(() => {
            node.dataset.leaving = 'true';
            setTimeout(() => node.remove(), 320);
        }, 3800);
    }

    /* ───────────── Empty state ───────────── */
    function renderEmpty() {
        el.emptyState.classList.remove('hidden');
        el.emptyState.classList.remove('pop-in');
        void el.emptyState.offsetWidth; // restart the spring
        el.emptyState.classList.add('pop-in');

        if (!state.doc) {
            el.emptyState.innerHTML = `
        <div class="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-slate-800 bg-ink-900 text-violet-300">${icon('file-search', 'h-6 w-6')}</div>
        <h2 class="text-xl font-semibold tracking-tight text-zinc-50">Start with a document</h2>
        <p class="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">Upload a PDF or text file in the panel, then ask anything. Every answer links back to the passage it came from.</p>`;
        } else {
            el.emptyState.innerHTML = `
        <div class="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400/20 to-violet-500/20 text-violet-200 ring-1 ring-inset ring-violet-400/20">${icon('sparkles', 'h-6 w-6')}</div>
        <h2 class="text-xl font-semibold tracking-tight text-zinc-50">${esc(state.doc.filename)} is ready</h2>
        <p class="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">${state.doc.chunkCount} passages indexed. Try one of these, or ask your own question.</p>
        <div id="suggestions" class="mt-6 flex max-w-xl flex-wrap justify-center gap-2.5"></div>`;
            const host = $('suggestions');
            SUGGESTIONS.forEach((s, i) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.style.animationDelay = `${120 + i * 70}ms`;
                b.className = 'pop-in press glow inline-flex items-center gap-2 rounded-full border border-slate-700 bg-ink-900/80 px-4 py-2 text-[13px] font-medium text-zinc-300 hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-100';
                b.innerHTML = `${icon(s.icon, 'h-3.5 w-3.5 text-violet-300')}<span>${esc(s.text)}</span>`;
                b.addEventListener('click', () => ask(s.text));
                host.appendChild(b);
            });
        }
        icons();
    }

    const hideEmpty = () => el.emptyState.classList.add('hidden');

    /* ───────────── Upload ───────────── */
    function setUploading(on, filename = '') {
        state.uploading = on;
        el.dzIdle.classList.toggle('hidden', on);
        el.dzBusy.classList.toggle('hidden', !on);
        el.dzBusy.classList.toggle('flex', on);
        if (on) el.busyTitle.textContent = `Indexing ${filename}…`;
        el.fileInput.disabled = on;
    }

    async function uploadFile(file) {
        if (!file || state.uploading) return;
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED.includes(ext)) {
            toast('Unsupported file type. Upload a PDF or TXT file.', 'error');
            return;
        }
        if (file.size === 0) {
            toast('That file is empty. Choose a file with content.', 'error');
            return;
        }

        setUploading(true, file.name);
        const body = new FormData();
        body.append('document', file);

        try {
            const [res] = await Promise.all([
                fetch(API.upload, { method: 'POST', body, headers: { 'X-CSRFToken': getCsrf() }, credentials: 'same-origin' }),
                wait(700), // keep the indexing state readable on fast responses
            ]);
            if (!res.ok) throw new Error(await readError(res));
            const data = await res.json();
            if (data.status && data.status !== 'success') throw new Error(data.error || data.message || 'Upload failed.');

            state.doc = { filename: data.filename || file.name, chunkCount: Number(data.chunk_count) || 0, size: file.size, ext };
            state.chunks.clear();
            state.activeChunk = null;
            el.stream.innerHTML = '';
            setStatus(true);
            renderFileCard();
            renderChunkPills();
            renderEmpty();
            updateComposer();
            toast(`${state.doc.filename} indexed · ${state.doc.chunkCount} chunks`, 'success');
            el.input.focus();
        } catch (err) {
            if (err instanceof TypeError) setStatus(false);
            toast(err instanceof TypeError ? 'Could not reach the server. Is Django running on port 8000?' : err.message, 'error');
        } finally {
            setUploading(false);
            el.fileInput.value = '';
        }
    }

    function renderFileCard() {
        const d = state.doc;
        el.fileCard.classList.remove('hidden');
        el.fileCard.classList.remove('pop-in');
        void el.fileCard.offsetWidth;
        el.fileCard.classList.add('pop-in');
        el.fileName.textContent = d.filename;
        el.fileName.title = d.filename;
        el.fileMeta.textContent = `${d.ext.toUpperCase()} · ${formatBytes(d.size)} · ${d.chunkCount} chunks`;
        el.fileIcon.setAttribute('data-lucide', d.ext === 'pdf' ? 'file-text' : 'file-type');
        el.headerDoc.textContent = d.filename;
        el.clearBtn.classList.remove('hidden');
        el.clearBtn.classList.add('inline-flex');
        icons();
    }

    /* ───────────── Chunk preview ───────────── */
    function renderChunkPills() {
        const total = state.doc ? state.doc.chunkCount : 0;
        const shown = Math.min(total, MAX_PILLS);
        el.chunkPills.innerHTML = '';
        for (let i = 0; i < shown; i++) {
            const known = state.chunks.has(i);
            const active = state.activeChunk === i;
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.chunk = i;
            b.className = `press rounded-full border px-2.5 py-1 text-[11px] font-medium ${active ? 'border-violet-400/60 bg-violet-500/20 text-violet-100'
                    : known ? 'border-violet-400/25 bg-violet-500/10 text-violet-200 hover:border-violet-400/50'
                        : 'border-slate-800 bg-ink-900 text-zinc-500 hover:border-slate-700 hover:text-zinc-300'}`;
            b.textContent = `#${i}`;
            b.setAttribute('aria-pressed', String(active));
            b.addEventListener('click', () => previewChunk(i));
            el.chunkPills.appendChild(b);
        }
        if (total > shown) {
            const more = document.createElement('span');
            more.className = 'px-1.5 py-1 text-[11px] text-zinc-600';
            more.textContent = `+${total - shown} more`;
            el.chunkPills.appendChild(more);
        }
    }

    function previewChunk(id) {
        state.activeChunk = state.activeChunk === id ? null : id;
        renderChunkPills();
        const c = state.chunks.get(id);
        if (state.activeChunk === null) {
            el.chunkPreview.textContent = 'Select a chunk to preview it. Passages fill in as your questions retrieve them.';
        } else if (c) {
            el.chunkPreview.innerHTML = `<p class="mb-1.5 font-medium text-zinc-300">Chunk #${id}${c.page != null ? ` · Page ${esc(c.page)}` : ''}</p><p class="whitespace-pre-wrap">${esc(c.text)}</p>`;
        } else {
            el.chunkPreview.innerHTML = `<p class="mb-1.5 font-medium text-zinc-300">Chunk #${id}</p><p>Not retrieved yet. Ask a question and any matching passages appear here.</p>`;
        }
    }

    function toggleChunkPanel() {
        const open = el.chunkPanel.dataset.open !== 'true';
        el.chunkPanel.dataset.open = String(open);
        el.chunkToggle.setAttribute('aria-expanded', String(open));
        el.chunkChevron.style.transform = open ? 'rotate(180deg)' : '';
    }

    /* ───────────── Messages ───────────── */
    function addUserMessage(text) {
        const wrap = document.createElement('div');
        wrap.className = 'pop-in flex justify-end';
        wrap.innerHTML = `<div class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500/90 to-violet-600/90 px-4 py-3 text-[15px] leading-relaxed text-white shadow-lg shadow-violet-950/40">${esc(text)}</div>`;
        el.stream.appendChild(wrap);
        scrollToBottom();
    }

    const aiShell = (inner) => `
    <div class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-800 bg-ink-900 text-violet-300">${icon('sparkles', 'h-4 w-4')}</div>
    <div class="min-w-0 flex-1">${inner}</div>`;

    function addLoader() {
        const wrap = document.createElement('div');
        wrap.className = 'pop-in flex gap-3';
        wrap.setAttribute('aria-label', 'Searching the document');
        wrap.innerHTML = aiShell(`
      <div class="rounded-2xl rounded-tl-md border border-slate-800 bg-ink-900/80 p-5">
        <p class="mb-3 flex items-center gap-2 text-xs text-zinc-500">${icon('scan-search', 'h-3.5 w-3.5 animate-pulse text-violet-300')}Searching the document…</p>
        <div class="space-y-2.5"><div class="skeleton h-3 w-[92%]"></div><div class="skeleton h-3 w-[78%]"></div><div class="skeleton h-3 w-[56%]"></div></div>
      </div>`);
        el.stream.appendChild(wrap);
        icons();
        scrollToBottom();
        return wrap;
    }

    function dedupeSources(sources) {
        const seen = new Map();
        (Array.isArray(sources) ? sources : []).forEach((s) => {
            if (s && s.chunk_id != null && !seen.has(s.chunk_id)) seen.set(s.chunk_id, s);
        });
        return [...seen.values()];
    }

    function renderAnswer(loaderNode, data, question) {
        const answer = String(data.answer || '').trim();
        const missing = answer.toLowerCase().replace(/[.\s]+$/, '').startsWith(NOT_FOUND);
        const sources = missing ? [] : dedupeSources(data.sources);

        sources.forEach((s) => state.chunks.set(Number(s.chunk_id), { page: s.page, text: s.text }));
        if (sources.length) renderChunkPills();

        const paragraphs = answer.split(/\n{2,}/).map((p) => `<p class="whitespace-pre-wrap">${esc(p)}</p>`).join('');

        const body = missing
            ? `<div class="rounded-2xl rounded-tl-md border border-amber-400/25 bg-amber-500/[0.06] p-5">
           <div class="flex items-start gap-3">
             <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-400/10 text-amber-300">${icon('search-x', 'h-4 w-4')}</div>
             <div>
               <p class="text-sm font-semibold text-amber-200">Not found in this document</p>
               <p class="mt-1 text-sm leading-relaxed text-amber-100/70">${esc(answer)} Try rephrasing, or ask about a topic the document covers.</p>
             </div>
           </div>
         </div>`
            : `<div class="rounded-2xl rounded-tl-md border border-slate-800 bg-ink-900/80 p-5 shadow-lg shadow-black/20">
           <div class="answer text-[15px] leading-7 text-zinc-200">${paragraphs || '<p class="text-zinc-500">The engine returned an empty answer.</p>'}</div>
           ${sources.length ? `
           <div class="mt-4 border-t border-slate-800/80 pt-3.5">
             <p class="mb-2 flex items-center gap-1.5 text-xs text-zinc-500">${icon('quote', 'h-3.5 w-3.5')}${sources.length} ${sources.length === 1 ? 'source' : 'sources'}</p>
             <div class="cite-row flex flex-wrap gap-2"></div>
             <div class="cite-detail expand" data-open="false"><div><div class="cite-body mt-3"></div></div></div>
           </div>` : ''}
         </div>`;

        const wrap = document.createElement('div');
        wrap.className = 'pop-in flex gap-3';
        wrap.innerHTML = aiShell(body);
        loaderNode.replaceWith(wrap);

        if (sources.length) wireCitations(wrap, sources);
        icons();
        scrollToBottom();
    }

    function wireCitations(wrap, sources) {
        const row = wrap.querySelector('.cite-row');
        const detail = wrap.querySelector('.cite-detail');
        const bodyNode = wrap.querySelector('.cite-body');
        let openId = null;

        const sync = () => {
            row.querySelectorAll('button').forEach((b) => {
                const on = Number(b.dataset.id) === openId;
                b.setAttribute('aria-expanded', String(on));
                b.classList.toggle('border-violet-400/60', on);
                b.classList.toggle('bg-violet-500/20', on);
                b.classList.toggle('text-violet-100', on);
            });
        };

        sources.forEach((s) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.id = s.chunk_id;
            b.setAttribute('aria-expanded', 'false');
            b.className = 'press inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-ink-950/60 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-violet-400/40 hover:text-violet-100';
            b.innerHTML = `${icon('file-text', 'h-3.5 w-3.5 text-violet-300')}Source: Page ${esc(s.page ?? '–')} [Chunk #${esc(s.chunk_id)}]`;
            b.addEventListener('click', () => {
                const id = Number(s.chunk_id);
                if (openId === id) {
                    openId = null;
                    detail.dataset.open = 'false';
                } else {
                    openId = id;
                    bodyNode.innerHTML = `
            <div class="pop-in rounded-xl border border-slate-800/80 bg-ink-950/80 p-4 shadow-inner shadow-black/40">
              <p class="mb-2 text-xs font-medium text-zinc-400">Page ${esc(s.page ?? '–')} · Chunk #${esc(s.chunk_id)}</p>
              <p class="whitespace-pre-wrap border-l-2 border-violet-400/40 pl-3 text-[13px] leading-relaxed text-zinc-400">${esc(s.text)}</p>
            </div>`;
                    detail.dataset.open = 'true';
                    setTimeout(() => scrollToBottom(), 120);
                }
                sync();
            });
            row.appendChild(b);
        });
        icons();
    }

    function renderError(loaderNode, message, question) {
        const wrap = document.createElement('div');
        wrap.className = 'pop-in flex gap-3';
        wrap.innerHTML = aiShell(`
      <div class="rounded-2xl rounded-tl-md border border-rose-400/25 bg-rose-500/[0.06] p-5">
        <div class="flex items-start gap-3">
          <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-400/10 text-rose-300">${icon('wifi-off', 'h-4 w-4')}</div>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-rose-200">Couldn’t get an answer</p>
            <p class="mt-1 text-sm leading-relaxed text-rose-100/70">${esc(message)}</p>
            <button type="button" class="retry press mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-400/10">${icon('rotate-ccw', 'h-3.5 w-3.5')}Try again</button>
          </div>
        </div>
      </div>`);
        loaderNode.replaceWith(wrap);
        wrap.querySelector('.retry').addEventListener('click', () => {
            wrap.remove();
            ask(question, { echo: false });
        });
        icons();
        scrollToBottom();
    }

    /* ───────────── Ask ───────────── */
    async function ask(rawQuestion, { echo = true } = {}) {
        const question = String(rawQuestion || '').trim();
        if (!question || state.busy) return;
        if (!state.doc) {
            toast('Upload a document first, then ask your question.', 'info');
            return;
        }

        state.busy = true;
        hideEmpty();
        if (echo) addUserMessage(question);
        el.input.value = '';
        autosize();
        updateComposer();
        const loader = addLoader();

        try {
            const res = await fetch(API.ask, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
                credentials: 'same-origin',
                body: JSON.stringify({ question }),
            });
            if (!res.ok) throw new Error(await readError(res));
            const data = await res.json();
            setStatus(true);
            renderAnswer(loader, data, question);
        } catch (err) {
            const offline = err instanceof TypeError;
            if (offline) setStatus(false);
            renderError(loader, offline ? 'The RAG engine is unreachable. Check that the server is running, then try again.' : err.message, question);
        } finally {
            state.busy = false;
            updateComposer();
            el.input.focus();
        }
    }

    /* ───────────── Composer ───────────── */
    function autosize() {
        el.input.style.height = 'auto';
        el.input.style.height = `${Math.min(el.input.scrollHeight, 200)}px`;
    }

    function updateComposer() {
        const hasDoc = !!state.doc;
        el.input.placeholder = hasDoc ? `Ask about ${state.doc.filename}…` : 'Upload a document to start asking…';
        el.sendBtn.disabled = !hasDoc || state.busy || !el.input.value.trim();
    }

    function clearChat() {
        el.stream.innerHTML = '';
        renderEmpty();
    }

    /* ───────────── Events ───────────── */
    el.fileInput.addEventListener('change', (e) => uploadFile(e.target.files[0]));
    el.replaceBtn.addEventListener('click', () => el.fileInput.click());
    el.chunkToggle.addEventListener('click', toggleChunkPanel);
    el.clearBtn.addEventListener('click', clearChat);

    ['dragenter', 'dragover'].forEach((t) =>
        el.dropzone.addEventListener(t, (e) => { e.preventDefault(); el.dropzone.dataset.drag = 'true'; }));
    ['dragleave', 'drop'].forEach((t) =>
        el.dropzone.addEventListener(t, (e) => { e.preventDefault(); el.dropzone.dataset.drag = 'false'; }));
    el.dropzone.addEventListener('drop', (e) => uploadFile(e.dataTransfer.files[0]));
    // Prevent the browser from navigating away when a file misses the dropzone.
    ['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => e.preventDefault()));

    el.input.addEventListener('input', () => { autosize(); updateComposer(); });
    el.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            ask(el.input.value);
        }
    });
    el.sendBtn.addEventListener('click', () => ask(el.input.value));

    /* ───────────── Init ───────────── */
    setStatus(true);
    renderEmpty();
    updateComposer();
    icons();
})();