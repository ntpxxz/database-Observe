from fastapi import FastAPI 
from pydantic import BaseModel
from .services import analyze_query_performance

app = FastAPI(title="AI Query Analysis Service")

class QueryAnalysisRequest(BaseModel):
    query: str
    db_type: str

class QueryAnalysisResponse(BaseModel):
    query: str
    suggestion: str

@app.post("/analyze-query/", response_model=QueryAnalysisResponse)
async def analyze_query(request: QueryAnalysisRequest):
    """
    Receives a slow query and returns an AI-generated suggestion.
    """
    suggestion = analyze_query_performance(request.query, request.db_type)
    return {"query": request.query, "suggestion": suggestion}

@app.get("/")
def read_root():
    return {"message": "Observability AI Service is running"}
