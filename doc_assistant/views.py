import os
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.files.storage import FileSystemStorage

from rag_engine.extractor import extract_text
from rag_engine.chunker import chunk_text
from rag_engine.vectorstore import VectorStore
from rag_engine.generator import generate_answer

# Global FAISS-backed store – persists for the lifetime of the dev-server process.
vector_store = VectorStore()


@csrf_exempt
def upload_document(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    if "document" not in request.FILES:
        return JsonResponse({"error": "No file uploaded. Use key 'document'."}, status=400)

    uploaded = request.FILES["document"]
    name = uploaded.name

    # Persist the file under uploads/
    fs = FileSystemStorage()
    saved_name = fs.save(name, uploaded)
    saved_path = fs.path(saved_name)

    ext = os.path.splitext(name)[1].lower()
    is_pdf = ext == ".pdf"

    try:
        pages = extract_text(saved_path, is_pdf=is_pdf)
        chunks = chunk_text(pages)
        vector_store.index_chunks(chunks)
    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=500)

    return JsonResponse({
        "status": "success",
        "filename": name,
        "chunk_count": len(chunks),
    })


@csrf_exempt
def ask_question(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    question = body.get("question", "").strip()
    if not question:
        return JsonResponse({"error": "Field 'question' is required."}, status=400)

    retrieved = vector_store.search(question)

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return JsonResponse({"error": "GEMINI_API_KEY environment variable is not set."}, status=500)

    try:
        answer, sources = generate_answer(question, retrieved, api_key)
    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=500)

    return JsonResponse({
        "answer": answer,
        "sources": sources,
    })
