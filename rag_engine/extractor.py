from __future__ import annotations

from pathlib import Path
from typing import List, Dict


def extract_text(file_path: str, is_pdf: bool = True) -> List[Dict]:
    """Extract text from a PDF or plain-text file.

    Args:
        file_path: Absolute or relative path to the source file.
        is_pdf:    When True the file is treated as a PDF; otherwise as plain text.

    Returns:
        A list of dicts: [{"page": int, "text": str}, ...]
        Page numbers are 1-indexed.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    pages: List[Dict] = []

    if is_pdf:
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise ImportError("pypdf is required for PDF extraction. Install it with: pip install pypdf") from exc

        reader = PdfReader(str(path))
        for page_num, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except Exception:
                text = ""
            pages.append({"page": page_num, "text": text.strip()})
    else:
        raw = None
        for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
            try:
                raw = path.read_text(encoding=enc)
                break
            except (UnicodeDecodeError, LookupError):
                continue

        if raw is None:
            raw = path.read_text(encoding="latin-1", errors="replace")

        lines = [line.strip() for line in raw.splitlines() if line.strip()]
        if lines:
            for page_num, line in enumerate(lines, start=1):
                pages.append({"page": page_num, "text": line})
        else:
            pages.append({"page": 1, "text": raw.strip() or "Empty document."})

    # If all pages are completely empty (e.g. scanned image PDF)
    has_text = any(bool(p["text"]) for p in pages)
    if not has_text:
        pages = [{"page": 1, "text": f"Document {path.name} contains no directly extractable text (e.g. scanned image)."}]

    return pages
