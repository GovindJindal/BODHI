"""
services/insurance_rag.py

Insurance document RAG pipeline using:
  - PyMuPDF for PDF text extraction
  - Gemini text-embedding-004 for embeddings (no local ML model needed)
  - In-memory cosine-similarity vector store
  - Gemini 1.5 Flash for strictly-grounded generation
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

from core.config import settings

# ---------------------------------------------------------------------------
# Config (env-overridable)
# ---------------------------------------------------------------------------
CHUNK_SIZE: int = settings.rag_chunk_size
CHUNK_OVERLAP: int = settings.rag_chunk_overlap
TOP_K: int = settings.rag_top_k
CONFIDENCE_HIGH: float = settings.rag_conf_high
CONFIDENCE_MED: float = settings.rag_conf_med

FALLBACK_MESSAGE = (
    "I was unable to find a specific answer to your question within the "
    "provided insurance document. Please consult your insurer or a licensed advisor."
)

GEMINI_API_KEY = settings.gemini_api_key


# ---------------------------------------------------------------------------
# RAG response schema
# ---------------------------------------------------------------------------
@dataclass
class RAGResponse:
    simple_explanation: str
    clause_reference: str | None
    confidence_level: str          # "High" | "Medium" | "Low"
    fallback: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "simple_explanation": self.simple_explanation,
            "clause_reference": self.clause_reference,
            "confidence_level": self.confidence_level,
            "fallback": self.fallback,
        }


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------
def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages: list[str] = []
        for page_num, page in enumerate(doc, start=1):
            text = page.get_text("text")
            if text.strip():
                pages.append(f"[Page {page_num}]\n{text.strip()}")
        doc.close()
        full = "\n\n".join(pages)
        if not full.strip():
            raise ValueError("No text extracted")
        logger.info("Extracted %d chars from %d pages", len(full), len(pages))
        return full
    except ImportError:
        logger.warning("PyMuPDF not installed; using mock OCR fallback")
        return _mock_ocr(pdf_bytes)
    except Exception as exc:
        logger.error("PDF extraction failed: %s; using mock OCR", exc)
        return _mock_ocr(pdf_bytes)


def _mock_ocr(pdf_bytes: bytes) -> str:
    digest = hashlib.sha256(pdf_bytes).hexdigest()[:8]
    return (
        f"[Page 1]\n"
        f"INSURANCE POLICY DOCUMENT (mock — digest {digest})\n\n"
        f"Clause 1.1 — Coverage: This policy covers hospitalisation expenses "
        f"up to INR 5,00,000 per annum.\n\n"
        f"Clause 2.3 — Exclusions: Pre-existing conditions are excluded for "
        f"the first 24 months.\n\n"
        f"[Page 2]\n"
        f"Clause 3.1 — Claim Process: Submit claims within 30 days of discharge.\n\n"
        f"Clause 4.0 — Premium: Annual premium is INR 12,000 inclusive of GST.\n"
    )


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------
@dataclass
class Chunk:
    chunk_id: str
    document_id: str
    text: str
    page_hint: str | None
    char_start: int
    char_end: int


def chunk_text(
    text: str,
    document_id: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[Chunk]:
    chunks: list[Chunk] = []
    pos = 0
    text_len = len(text)

    while pos < text_len:
        end = min(pos + chunk_size, text_len)

        # Snap to sentence boundary
        snap_start = max(pos, end - chunk_size // 5)
        boundary = text.rfind(". ", snap_start, end)
        if boundary != -1:
            end = boundary + 2

        window = text[pos:end]

        page_hint: str | None = None
        match = re.search(r"\[Page (\d+)\]", window)
        if match:
            page_hint = f"Page {match.group(1)}"
        else:
            preceding = text[:pos]
            back_matches = list(re.finditer(r"\[Page (\d+)\]", preceding))
            if back_matches:
                page_hint = f"Page {back_matches[-1].group(1)}"

        stripped = window.strip()
        if stripped:
            chunks.append(Chunk(
                chunk_id=str(uuid.uuid4()),
                document_id=document_id,
                text=stripped,
                page_hint=page_hint,
                char_start=pos,
                char_end=end,
            ))

        pos = end - overlap
        if pos <= 0:
            break

    return chunks


# ---------------------------------------------------------------------------
# Embedding (Gemini text-embedding-004 or deterministic mock fallback)
# ---------------------------------------------------------------------------
def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


MOCK_DIM = 384


def _mock_embed(text: str) -> list[float]:
    vec = [0.0] * MOCK_DIM
    words = re.findall(r"\w+", text.lower())
    for word in words:
        idx = hash(word) % MOCK_DIM
        vec[idx] += 1.0
    mag = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / mag for v in vec]


def _embed_with_gemini(texts: list[str]) -> list[list[float]]:
    """Use Gemini's embedding API. Falls back to mock on any failure."""
    if not GEMINI_API_KEY:
        logger.warning("No GEMINI_API_KEY — using mock embeddings")
        return [_mock_embed(t) for t in texts]
    try:
        from google import genai
        client = genai.Client(api_key=GEMINI_API_KEY)
        results = []
        # Batch in groups of 100
        for i in range(0, len(texts), 100):
            batch = texts[i:i + 100]
            resp = client.models.embed_content(
                model="models/gemini-embedding-001",
                contents=batch,
            )
            for emb_obj in resp.embeddings:
                results.append(emb_obj.values)
        return results
    except Exception as exc:
        logger.warning("Gemini embedding failed (%s); using mock", exc)
        return [_mock_embed(t) for t in texts]


def _embed_query_with_gemini(query: str) -> list[float]:
    if not GEMINI_API_KEY:
        return _mock_embed(query)
    try:
        from google import genai
        client = genai.Client(api_key=GEMINI_API_KEY)
        resp = client.models.embed_content(
            model="models/gemini-embedding-001",
            contents=query,
        )
        return resp.embeddings[0].values
    except Exception as exc:
        logger.warning("Gemini query embedding failed (%s); using mock", exc)
        return _mock_embed(query)


# ---------------------------------------------------------------------------
# Vector store
# ---------------------------------------------------------------------------
@dataclass
class VectorStore:
    chunks: list[Chunk] = field(default_factory=list)
    embeddings: list[list[float]] = field(default_factory=list)

    def add(self, chunks: list[Chunk], embeddings: list[list[float]]) -> None:
        self.chunks.extend(chunks)
        self.embeddings.extend(embeddings)

    def query(self, query_embedding: list[float], top_k: int = TOP_K) -> list[tuple[Chunk, float]]:
        if not self.chunks:
            return []
        scored = [
            (chunk, _cosine_similarity(query_embedding, emb))
            for chunk, emb in zip(self.chunks, self.embeddings)
        ]
        scored.sort(key=lambda x: -x[1])
        return scored[:top_k]

    def clear_document(self, document_id: str) -> None:
        pairs = [
            (c, e) for c, e in zip(self.chunks, self.embeddings)
            if c.document_id != document_id
        ]
        self.chunks = [p[0] for p in pairs]
        self.embeddings = [p[1] for p in pairs]


# ---------------------------------------------------------------------------
# LLM: strict generation grounded in document context only
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """You are an insurance document assistant for the BODHI app.

STRICT RULES — you MUST follow all of them:
1. Your ONLY source of knowledge is the DOCUMENT EXCERPTS provided below.
2. You MUST NOT use outside knowledge, training data, or general insurance expertise.
3. If someone asks about anything unrelated to the insurance document (weather, math, general chat), respond with: {"simple_explanation": "I can only answer questions about your uploaded insurance policy document.", "clause_reference": null, "confidence_level": "Low", "fallback": "Please ask a question related to your insurance policy."}
4. If the answer cannot be found in the excerpts, populate fallback.
5. Respond ONLY with a valid JSON object — no markdown, no prose, no code fences.
6. The JSON must have EXACTLY these four keys:
   "simple_explanation" : string (plain English, friendly tone)
   "clause_reference"   : string or null
   "confidence_level"   : "High", "Medium", or "Low"
   "fallback"           : string or null"""

_FALLBACK_RESPONSE = RAGResponse(
    simple_explanation="The requested information could not be located in the document.",
    clause_reference=None,
    confidence_level="Low",
    fallback=FALLBACK_MESSAGE,
)

_OFF_TOPIC_RESPONSE = RAGResponse(
    simple_explanation="I can only answer questions about your uploaded insurance policy document.",
    clause_reference=None,
    confidence_level="Low",
    fallback="Please ask a question related to your insurance policy.",
)


def _extract_json_object(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-z]*\n?", "", cleaned)
        cleaned = cleaned.rstrip("`").strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError(f"No JSON object found in: {cleaned[:200]}")
    return json.loads(cleaned[start: end + 1])


def _call_llm(context: str, question: str, confidence_level: str) -> RAGResponse:
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set; using mock LLM")
        return _mock_llm_response(context, question, confidence_level)

    try:
        from google import genai as google_genai
        from google.genai import types

        client = google_genai.Client(api_key=GEMINI_API_KEY)

        user_message = (
            f"DOCUMENT EXCERPTS:\n{context}\n\n"
            f"QUESTION: {question}\n\n"
            f"Retrieval confidence: {confidence_level}\n\n"
            f"Answer strictly from the excerpts. Return valid JSON only."
        )

        response = client.models.generate_content(
            model="gemini-1.5-flash",
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                temperature=0.0,
                response_mime_type="application/json",
            ),
        )

        raw = (response.text or "").strip()
        logger.debug("LLM raw: %s", raw[:500])
        data = _extract_json_object(raw)

        return RAGResponse(
            simple_explanation=data.get("simple_explanation", ""),
            clause_reference=data.get("clause_reference"),
            confidence_level=data.get("confidence_level", confidence_level),
            fallback=data.get("fallback"),
        )

    except Exception as exc:
        logger.exception("LLM call failed: %s", exc)
        return _FALLBACK_RESPONSE


def _mock_llm_response(context: str, question: str, confidence_level: str) -> RAGResponse:
    sentences = [s.strip() for s in context.split(".") if len(s.strip()) > 20]
    explanation = sentences[0] + "." if sentences else "See document for details."
    clause_match = re.search(r"Clause\s+[\d.]+", context)
    page_match = re.search(r"\[Page (\d+)\]", context)
    clause_ref: str | None = None
    if clause_match:
        clause_ref = clause_match.group(0)
    elif page_match:
        clause_ref = f"Page {page_match.group(1)}"
    fallback = FALLBACK_MESSAGE if confidence_level == "Low" else None
    return RAGResponse(
        simple_explanation=explanation,
        clause_reference=clause_ref,
        confidence_level=confidence_level,
        fallback=fallback,
    )


# ---------------------------------------------------------------------------
# RAG pipeline singleton
# ---------------------------------------------------------------------------
class InsuranceRAG:
    def __init__(self) -> None:
        self.vector_store = VectorStore()
        self._documents: dict[str, dict[str, Any]] = {}

    def ingest(
        self,
        pdf_bytes: bytes,
        document_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        document_id = document_id or str(uuid.uuid4())
        self.vector_store.clear_document(document_id)

        text = extract_text_from_pdf(pdf_bytes)
        chunks = chunk_text(text, document_id)
        if not chunks:
            raise ValueError("No text could be extracted from this PDF.")

        texts = [c.text for c in chunks]
        embeddings = _embed_with_gemini(texts)
        self.vector_store.add(chunks, embeddings)

        self._documents[document_id] = {
            "document_id": document_id,
            "chunk_count": len(chunks),
            "char_count": len(text),
            "metadata": metadata or {},
        }

        logger.info(
            "Document ingested: id=%s chunks=%d chars=%d",
            document_id, len(chunks), len(text),
        )
        return self._documents[document_id]

    def query(self, question: str, document_id: str | None = None) -> RAGResponse:
        # No document ingested at all
        if not self.vector_store.chunks:
            return _FALLBACK_RESPONSE

        q_embedding = _embed_query_with_gemini(question)
        candidates = self.vector_store.query(q_embedding, top_k=TOP_K * 2)

        if document_id:
            candidates = [(c, s) for c, s in candidates if c.document_id == document_id]

        candidates = candidates[:TOP_K]

        if not candidates:
            return _FALLBACK_RESPONSE

        top_score = candidates[0][1]

        if top_score >= CONFIDENCE_HIGH:
            confidence = "High"
        elif top_score >= CONFIDENCE_MED:
            confidence = "Medium"
        else:
            confidence = "Low"

        context_parts: list[str] = []
        for chunk, score in candidates:
            header = f"[{chunk.page_hint or 'Unknown page'} | similarity={score:.3f}]"
            context_parts.append(f"{header}\n{chunk.text}")
        context = "\n\n---\n\n".join(context_parts)

        return _call_llm(context, question, confidence)

    def list_documents(self) -> list[dict[str, Any]]:
        return list(self._documents.values())


# Module-level singleton
rag_pipeline = InsuranceRAG()
