from __future__ import annotations

from typing import List, Dict, Tuple

_SYSTEM_INSTRUCTION = (
    "Answer strictly using provided context. "
    "If missing, output EXACTLY: "
    "'Information could not be found in the uploaded document.'"
)

_NOT_FOUND = "Information could not be found in the uploaded document."


def generate_answer(
    query: str,
    retrieved_chunks: List[Dict],
    api_key: str,
) -> Tuple[str, List[Dict]]:
    """Generate an answer grounded in *retrieved_chunks* using Gemini.

    Args:
        query:            The user's question.
        retrieved_chunks: Chunks returned by ``VectorStore.search``.
        api_key:          Google Generative AI API key.

    Returns:
        A tuple of ``(answer_string, cited_chunks)``.
        ``cited_chunks`` mirrors *retrieved_chunks* when context is used,
        or an empty list when the model reports the answer is not found.
    """
    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise ImportError(
            "google-generativeai is required. Install with: pip install google-generativeai"
        ) from exc

    genai.configure(api_key=api_key)

    # Build context block
    context_parts: List[str] = []
    for i, chunk in enumerate(retrieved_chunks, start=1):
        context_parts.append(
            f"[Chunk {i} | Page {chunk['page']}]\n{chunk['text']}"
        )
    context_block = "\n\n".join(context_parts) if context_parts else "(No context provided.)"

    prompt = (
        f"Context:\n{context_block}\n\n"
        f"Question: {query}\n\n"
        "Answer:"
    )

    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=_SYSTEM_INSTRUCTION,
    )

    response = model.generate_content(prompt)
    answer: str = response.text.strip()

    cited_chunks = [] if answer == _NOT_FOUND else list(retrieved_chunks)
    return answer, cited_chunks


# ---------------------------------------------------------------------------
# Demo / smoke-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import os
    import sys

    # ---------------------------------------------------------------------------
    # Mock pipeline (no real PDF / API key needed for structure validation)
    # ---------------------------------------------------------------------------
    from rag_engine.extractor import extract_text
    from rag_engine.chunker import chunk_text
    from rag_engine.vectorstore import VectorStore

    # ---- 1. Mock "document" as plain-text lines ---------------------------
    mock_doc_lines = [
        "The Eiffel Tower is located in Paris, France.",
        "It was constructed between 1887 and 1889 as the entrance arch for the 1889 World's Fair.",
        "The tower stands 330 metres tall and was the world's tallest man-made structure for 41 years.",
        "Gustave Eiffel's company designed and built the tower.",
        "Over 7 million people visit the Eiffel Tower every year.",
        "The structure is repainted every seven years using roughly 60 tonnes of paint.",
    ]

    # Write to a temp file so extractor.extract_text can open it
    import tempfile, pathlib

    tmp = pathlib.Path(tempfile.mktemp(suffix=".txt"))
    tmp.write_text("\n".join(mock_doc_lines), encoding="utf-8")

    print("=== RAG Pipeline Demo ===\n")

    # ---- 2. Extract -------------------------------------------------------
    pages = extract_text(str(tmp), is_pdf=False)
    print(f"[extractor] {len(pages)} page(s) extracted.")

    # ---- 3. Chunk ---------------------------------------------------------
    chunks = chunk_text(pages, chunk_size=200, overlap=40)
    print(f"[chunker]   {len(chunks)} chunk(s) created.")

    # ---- 4. Embed & index -------------------------------------------------
    store = VectorStore()
    store.index_chunks(chunks)
    print(f"[vectorstore] {store.index.ntotal} vector(s) indexed.\n")

    # ---- 5. Retrieve ------------------------------------------------------
    query = "Who designed the Eiffel Tower?"
    top_chunks = store.search(query, top_k=3)
    print(f"Query: {query!r}")
    print("Top retrieved chunks:")
    for c in top_chunks:
        print(f"  chunk_id={c['chunk_id']} page={c['page']} | {c['text'][:80]!r}")

    # ---- 6. Generate ------------------------------------------------------
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        print(
            "\n[generator] GOOGLE_API_KEY not set – skipping live generation.\n"
            "            Set the environment variable and re-run to test generation."
        )
        tmp.unlink(missing_ok=True)
        sys.exit(0)

    print("\n[generator] Calling Gemini 1.5 Flash …")
    answer, cited = generate_answer(query, top_chunks, api_key)

    print(f"\nAnswer:\n  {answer}")
    print(f"\nCited chunks ({len(cited)}):")
    for c in cited:
        print(f"  chunk_id={c['chunk_id']} page={c['page']}")

    tmp.unlink(missing_ok=True)
