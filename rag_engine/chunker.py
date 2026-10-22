from __future__ import annotations

from typing import List, Dict


def chunk_text(
    pages: List[Dict],
    chunk_size: int = 500,
    overlap: int = 100,
) -> List[Dict]:
    """Split extracted page text into overlapping chunks.

    Args:
        pages:      Output of ``extract_text`` – list of {"page": int, "text": str}.
        chunk_size: Maximum number of characters per chunk.
        overlap:    Number of characters carried over from the previous chunk.

    Returns:
        A list of dicts: [{"chunk_id": int, "page": int, "text": str}, ...]
        ``chunk_id`` is globally unique and 0-indexed.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer.")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be >= 0 and < chunk_size.")

    chunks: List[Dict] = []
    chunk_id = 0

    for page_dict in pages:
        page_num: int = page_dict.get("page", 1)
        text: str = page_dict.get("text", "").strip()

        if not text:
            continue

        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk_text_slice = text[start:end]
            chunks.append({
                "chunk_id": chunk_id,
                "page": page_num,
                "text": chunk_text_slice,
            })
            chunk_id += 1
            if end >= len(text):
                break
            start = end - overlap

    if not chunks:
        chunks.append({
            "chunk_id": 0,
            "page": 1,
            "text": "The uploaded document has no extractable text content.",
        })

    return chunks
