import os
import google.generativeai as genai
from .extractor import extract_text
from .chunker import chunk_text
from .vectorstore import VectorStore

def generate_answer(query: str, retrieved_chunks: list, api_key: str = None):
    if api_key:
        genai.configure(api_key=api_key)
    
    # Initializing the exact model version required by your new API key
    model = genai.GenerativeModel('gemini-3.8-flash')
    
    if not retrieved_chunks:
        return "Information could not be found in the uploaded document.", []

    context_text = "\n\n".join([f"Page {c['page']}: {c['text']}" for c in retrieved_chunks])
    
    # System instructions embedded in the prompt body for maximum compatibility
    prompt = f"""
    SYSTEM INSTRUCTION: You are a strict document intelligence assistant. 
    Answer the user's question using ONLY the context provided below. 
    If the answer is not contained within the context, you must output exactly: 
    "Information could not be found in the uploaded document."

    CONTEXT:
    {context_text}

    QUESTION:
    {query}
    """
    
    try:
        response = model.generate_content(prompt)
        return response.text, retrieved_chunks
    except Exception as e:
        return f"API Error: {str(e)}", []