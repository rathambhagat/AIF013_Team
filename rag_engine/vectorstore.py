from __future__ import annotations

from typing import List, Dict

import numpy as np


class VectorStore:
    """FAISS-backed vector store powered by SentenceTransformers.

    Attributes:
        model:    The loaded SentenceTransformer model.
        index:    The FAISS IndexFlatL2 index.
        metadata: Ordered list of chunk dicts mirroring index order.
    """

    EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 output dimension

    def __init__(self) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise ImportError(
                "sentence-transformers is required. Install with: pip install sentence-transformers"
            ) from exc

        try:
            import faiss
        except ImportError as exc:
            raise ImportError(
                "faiss-cpu is required. Install with: pip install faiss-cpu"
            ) from exc

        import faiss as _faiss

        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        self._faiss = _faiss
        self.index = _faiss.IndexFlatL2(self.EMBEDDING_DIM)
        self.metadata: List[Dict] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def index_chunks(self, chunks: List[Dict]) -> None:
        """Encode *chunks* and add them to the FAISS index.

        Args:
            chunks: Output of ``chunk_text`` –
                    list of {"chunk_id": int, "page": int, "text": str}.
        """
        if not chunks:
            return

        texts = [c["text"] for c in chunks]
        embeddings = self._encode(texts)
        self.index.add(embeddings)
        self.metadata.extend(chunks)

    def index(self, chunks: List[Dict]) -> None:
        """Alias for index_chunks to support both method names."""
        self.index_chunks(chunks)

    def search(self, query: str, top_k: int = 3) -> List[Dict]:
        """Return the *top_k* most relevant chunks for *query*.

        Args:
            query:  The user's natural-language question.
            top_k:  Number of results to return.

        Returns:
            A list of chunk dicts (subset of what was passed to ``index_chunks``),
            ordered from most to least relevant.
        """
        if self.index.ntotal == 0:
            return []

        top_k = min(top_k, self.index.ntotal)
        query_vec = self._encode([query])
        _, indices = self.index.search(query_vec, top_k)

        results: List[Dict] = []
        for idx in indices[0]:
            if idx == -1:
                continue
            results.append(self.metadata[idx])
        return results

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _encode(self, texts: List[str]) -> np.ndarray:
        embeddings = self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        return embeddings.astype("float32")
