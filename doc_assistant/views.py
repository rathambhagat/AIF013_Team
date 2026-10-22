import os
import json
import warnings
from datetime import date

from dotenv import load_dotenv
from django.conf import settings
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.files.storage import FileSystemStorage

from rag_engine.extractor import extract_text
from rag_engine.chunker import chunk_text
from rag_engine.vectorstore import VectorStore
from rag_engine.generator import generate_answer

load_dotenv()

# Global in-memory FAISS store
vector_store = VectorStore()

# In-memory document registry  { id -> {id, title, kind, pages, chunks, uploaded} }
_docs: dict = {}
_doc_counter = 0


# ── Pages ──────────────────────────────────────────────────────────────────

def landing_view(request):
    """Render the Sylva product landing page."""
    return render(request, 'landing.html')


def workspace_view(request):
    """Render the Sylva multi-document intelligence workspace."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    context = {
        'max_mb': 50,
        'mode': {
            'live': bool(api_key),
            'label': 'Gemini RAG Engine Active' if api_key else 'Set GEMINI_API_KEY to enable generation',
        },
        'docs_json': list(_docs.values()),
        'history_json': [],
    }
    return render(request, 'workspace.html', context)


def index_view(request):
    """Render the DocMind single-document assistant app."""
    return render(request, 'index.html')


# ── Upload  POST /api/documents/upload/ or /api/upload/ ────────────────────

@csrf_exempt
def upload_document(request):
    """Handle document uploads from both workspace.js and app.js."""
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed."}, status=405)

    if not request.FILES:
        return JsonResponse({"error": "No file attached."}, status=400)

    # Support 'document' (app.js), 'file' (workspace.js), or first attached file
    file_key = 'document' if 'document' in request.FILES else ('file' if 'file' in request.FILES else next(iter(request.FILES)))
    uploaded = request.FILES[file_key]
    original_name = uploaded.name

    media_root = str(settings.MEDIA_ROOT)
    os.makedirs(media_root, exist_ok=True)

    fs = FileSystemStorage(location=media_root)
    saved_name = fs.save(original_name, uploaded)
    saved_path = fs.path(saved_name)

    ext = os.path.splitext(saved_name)[1].lower().lstrip('.')
    is_pdf = ext == 'pdf'

    try:
        pages = extract_text(saved_path, is_pdf=is_pdf)
        chunks = chunk_text(pages)

        global _doc_counter
        _doc_counter += 1
        doc_id = str(_doc_counter)

        for c in chunks:
            c['document'] = original_name
            c['doc_id'] = doc_id

        vector_store.index_chunks(chunks)
    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=500)

    doc_meta = {
        "id": doc_id,
        "title": original_name,
        "kind": ext if ext in ('pdf', 'txt') else 'txt',
        "pages": len(pages),
        "chunks": len(chunks),
        "uploaded": date.today().strftime('%b %d, %Y'),
    }
    _docs[doc_id] = doc_meta

    return JsonResponse({
        "status": "success",
        "filename": original_name,
        "chunk_count": len(chunks),
        "document": doc_meta,
    })


# ── Delete  DELETE /api/documents/<id>/ ────────────────────────────────────

@csrf_exempt
def delete_document(request, doc_id):
    """Delete a document by ID."""
    if request.method != 'DELETE':
        return JsonResponse({"error": "Method not allowed."}, status=405)
    _docs.pop(str(doc_id), None)
    return JsonResponse({"status": "deleted"})


# ── Ask  POST /api/ask/ ────────────────────────────────────────────────────

@csrf_exempt
def ask_question(request):
    """Query the vector store and generate a strictly-grounded answer."""
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed."}, status=405)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    question = body.get('question', '').strip()
    if not question:
        return JsonResponse({"error": "Field 'question' is required."}, status=400)

    retrieved = vector_store.search(question, top_k=5)

    api_key = os.environ.get("GEMINI_API_KEY") or "AQ.Ab8RN6IKy7jBiwrGmzL0cSnMi7HL4ucTeJsbWrAy6TaOM67JIg"
    if not api_key:
        return JsonResponse({"error": "GEMINI_API_KEY is not set on the server."}, status=500)

    try:
        answer, cited = generate_answer(question, retrieved, api_key)
    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=500)

    if answer.startswith("API Error:"):
        return JsonResponse({"error": answer}, status=500)

    not_found_marker = "information could not be found in the uploaded document"
    found = not answer.lower().startswith(not_found_marker)

    doc_title = body.get('doc_title', 'Document')
    sources = []
    for c in cited:
        sources.append({
            "document": c.get("document", doc_title),
            "page": c.get("page", 1),
            "passage": c.get("text", ""),
            "score": 1.0,
            "chunk_id": c.get("chunk_id", 0),
            "text": c.get("text", ""),
        })

    return JsonResponse({
        "answer": answer,
        "found": found,
        "sources": sources,
        "closest": [],
    })