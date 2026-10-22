from __future__ import annotations

from pathlib import Path
from typing import List, Dict


def extract_text(file_path: str, is_pdf: bool = True) -> List[Dict]:
    """Extract text from a PDF or plain-text file.

    Args:
        file_path: Absolute or relative path to the source file.
        is_pdf:    When True the file is treated as a PDF; otherwise as UTF-8
                   plain text where each line is treated as a single "page".

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
            text = page.extract_text() or ""
            pages.append({"page": page_num, "text": text.strip()})
    else:
        raw = path.read_text(encoding="utf-8")
        for page_num, line in enumerate(raw.splitlines(), start=1):
            stripped = line.strip()
            if stripped:
                pages.append({"page": page_num, "text": stripped})

    return pages
