from __future__ import annotations

import os
import warnings
from typing import List, Dict, Optional
import numpy as np

try:
    import google.generativeai as genai
except ImportError:
    genai = None


class VectorStore:
    """Hybrid Vector Store supporting SentenceTransformers + FAISS,
    Gemini Embeddings, and Cosine Search.
    
    Operates seamlessly both in heavy local environments and lightweight
    serverless environments like Vercel Lambda without requiring PyTorch.
    """

    EMBEDDING_DIM = 384  # default all-MiniLM-L6-v2 dimension

    def __init__(self) -> None:
        self.metadata: List[Dict] = []
        self.embeddings: List[np.ndarray] = []
        self.backend: str = "gemini"
        self.model = None
        self.index = None
        self._faiss = None

        # 1. Try SentenceTransformer if installed (local dev)
        try:
            from sentence_transformers import SentenceTransformer
            import faiss
            self.model = SentenceTransformer("all-MiniLM-L6-v2")
            self._faiss = faiss
            self.index = faiss.IndexFlatL2(self.EMBEDDING_DIM)
            self.backend = "sentence-transformers"
        except Exception:
            # 2. Serverless / Vercel mode: Use Gemini Embeddings with cosine similarity
            self.backend = "gemini"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def index_chunks(self, chunks: List[Dict]) -> None:
        """Encode *chunks* and add them to the vector store.

        Args:
            chunks: List of {"chunk_id": int, "page": int, "text": str}.
        """
        if not chunks:
            return

        texts = [c.get("text", "") for c in chunks]
        embs = self._encode(texts)

        if embs is not None and len(embs) > 0:
            if self.index is not None:
                self.index.add(embs)
            else:
                for row in embs:
                    self.embeddings.append(row)

        self.metadata.extend(chunks)

    def index(self, chunks: List[Dict]) -> None:
        """Alias for index_chunks."""
        self.index_chunks(chunks)

    def search(self, query: str, top_k: int = 3) -> List[Dict]:
        """Return the *top_k* most relevant chunks for *query*.

        Args:
            query: Natural language question.
            top_k: Number of results to return.

        Returns:
            Ordered list of chunk dicts.
        """
        if not self.metadata:
            return []

        top_k = min(top_k, len(self.metadata))

        # FAISS search path (when local sentence-transformers is active)
        if self.index is not None and getattr(self.index, "ntotal", 0) > 0:
            query_vec = self._encode([query])
            if query_vec is not None and len(query_vec) > 0:
                _, indices = self.index.search(query_vec, top_k)
                results: List[Dict] = []
                for idx in indices[0]:
                    if 0 <= idx < len(self.metadata):
                        results.append(self.metadata[idx])
                if results:
                    return results

        # Cosine similarity path (Gemini embeddings / NumPy)
        if self.embeddings:
            query_vec = self._encode([query])
            if query_vec is not None and len(query_vec) > 0:
                q_vec = query_vec[0]
                mat = np.array(self.embeddings, dtype="float32")
                q_norm = float(np.linalg.norm(q_vec)) + 1e-9
                mat_norm = np.linalg.norm(mat, axis=1) + 1e-9
                scores = np.dot(mat, q_vec) / (mat_norm * q_norm)
                top_indices = np.argsort(scores)[::-1][:top_k]
                return [self.metadata[i] for i in top_indices if i < len(self.metadata)]

        # Keyword matching fallback if vector encoding is unavailable
        q_words = set(query.lower().split())
        scored = []
        for chunk in self.metadata:
            text_words = set(chunk.get("text", "").lower().split())
            score = len(q_words & text_words)
            scored.append((score, chunk))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [c for _, c in scored[:top_k]]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _encode(self, texts: List[str]) -> Optional[np.ndarray]:
        if not texts:
            return np.empty((0, self.EMBEDDING_DIM), dtype="float32")

        # Mode A: SentenceTransformer
        if self.backend == "sentence-transformers" and self.model is not None:
            try:
                embs = self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
                return embs.astype("float32")
            except Exception:
                pass

        # Mode B: Gemini Embeddings API
        if genai is not None:
            api_key = os.environ.get("GEMINI_API_KEY") or "AQ.Ab8RN6IKy7jBiwrGmzL0cSnMi7HL4ucTeJsbWrAy6TaOM67JIg"
            if api_key:
                try:
                    genai.configure(api_key=api_key)
                    # When multiple texts, embed each
                    embs = []
                    for t in texts:
                        res = genai.embed_content(
                            model="models/gemini-embedding-001",
                            content=t or " "
                        )
                        embs.append(res["embedding"])
                    return np.array(embs, dtype="float32")
                except Exception:
                    pass

        return None
