import logging
import uuid
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status, Depends
from pydantic import BaseModel

from services.auth_service import get_current_user
from services.insurance_rag import RAGResponse, rag_pipeline

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/insurance", tags=["insurance"])

class IngestResponse(BaseModel):
    document_id: str
    chunk_count: int
    char_count: int
    metadata: dict[str, Any]

class QueryRequest(BaseModel):
    question: str
    document_id: str | None = None

class QueryResponse(BaseModel):
    simple_explanation: str
    clause_reference: str | None
    confidence_level: str
    fallback: str | None

@router.post("/documents", response_model=IngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest_document(
    file: UploadFile = File(..., description="Insurance policy PDF"),
    document_id: str | None = Form(default=None),
    current_user = Depends(get_current_user) # Secured
) -> IngestResponse:
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PDF files are accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty")

    doc_id = document_id or str(uuid.uuid4())

    try:
        result = rag_pipeline.ingest(pdf_bytes, document_id=doc_id)
    except Exception as exc:
        logger.exception("Ingestion failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Document ingestion failed: {exc}") from exc

    return IngestResponse(**result)

@router.post("/query", response_model=QueryResponse)
async def query_document(
    body: QueryRequest,
    current_user = Depends(get_current_user) # Secured
) -> QueryResponse:
    if not body.question.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Question must not be empty")

    try:
        response: RAGResponse = rag_pipeline.query(body.question.strip(), document_id=body.document_id)
    except Exception as exc:
        logger.exception("RAG query failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Query failed: {exc}") from exc

    return QueryResponse(**response.to_dict())

@router.get("/documents", response_model=list[IngestResponse])
async def list_documents(current_user = Depends(get_current_user)) -> list[IngestResponse]:
    return [IngestResponse(**d) for d in rag_pipeline.list_documents()]