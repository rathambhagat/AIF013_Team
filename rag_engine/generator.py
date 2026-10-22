from __future__ import annotations

import warnings
from typing import List, Dict, Tuple

warnings.filterwarnings("ignore", category=FutureWarning)

import google.generativeai as genai

_SYSTEM_INSTRUCTION = (
    "Answer strictly using provided context. "
    "If missing, output EXACTLY: "
    "'Information could not be found in the uploaded document.'"
)

_NOT_FOUND = "Information could not be found in the uploaded document."


def generate_answer(
    query: str,
    retrieved_chunks: List[Dict],
    api_key: str = None,
) -> Tuple[str, List[Dict]]:
    """Generate a grounded answer using Gemini with strict citation context.

    Returns:
        (answer_string, cited_chunks)
    """
    if not api_key:
        return "GEMINI_API_KEY is not configured on the server.", []

    genai.configure(api_key=api_key)

    if not retrieved_chunks:
        return _NOT_FOUND, []

    # Build numbered context block
    context_parts = []
    for i, chunk in enumerate(retrieved_chunks, start=1):
        page = chunk.get('page', 1)
        text = chunk.get('text', '')
        context_parts.append(
            f"[Chunk {i} | Page {page}]\n{text}"
        )
    context_block = "\n\n".join(context_parts)

    prompt = (
        f"Context:\n{context_block}\n\n"
        f"Question: {query}\n\n"
        "Answer:"
    )

    answer = None
    last_err = None

    # Try fast, active Gemini 3.5 models with timeout fallback
    candidate_models = (
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-3.6-flash",
        "gemini-3-flash-preview",
    )
    for model_name in candidate_models:
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=_SYSTEM_INSTRUCTION,
            )
            response = model.generate_content(
                prompt,
                request_options={"timeout": 12},
            )
            if response and response.text:
                answer = response.text.strip()
                break
        except Exception as exc:
            last_err = exc

    if answer is None:
        return f"API Error: {last_err}", []

    cited = [] if answer == _NOT_FOUND else list(retrieved_chunks)
    return answer, cited