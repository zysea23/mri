# app/models/simple_rag/simple_rag.py

import os
import json
import faiss
import numpy as np
from typing import List, Dict, Tuple, Any
from sentence_transformers import SentenceTransformer
import time
import re

class SimpleRAG:
    """
    A simple RAG (Retrieval Augmented Generation) system that uses all-MiniLM-L6-v2
    to create embeddings for medical textbook chunks and enables semantic search.
    """
    
    def __init__(self, 
                 textbooks_dir: str = "textbooks",
                 index_dir: str = "corpus/textbooks/index/simple_rag",
                 chunk_dir: str = "corpus/textbooks/chunk",
                 model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
                 chunk_size: int = 512,
                 chunk_overlap: int = 128):
        """
        Initialize the SimpleRAG system
        
        Args:
            textbooks_dir: Directory containing textbook files
            index_dir: Directory to store the FAISS index
            chunk_dir: Directory to store chunks
            model_name: Name of the sentence transformer model
            chunk_size: Size of text chunks in characters
            chunk_overlap: Overlap between chunks in characters
        """
        self.textbooks_dir = textbooks_dir
        self.index_dir = index_dir
        self.chunk_dir = chunk_dir
        self.model_name = model_name
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        
        # Create directories if they don't exist
        os.makedirs(self.index_dir, exist_ok=True)
        os.makedirs(self.chunk_dir, exist_ok=True)
        
        # Initialize the model
        self.model = None  # Load only when needed to save memory
        
        # FAISS index
        self.index = None
        self.chunks = []
        self.metadatas = []
        
    def _load_model(self):
        """Load the embedding model if not already loaded"""
        if self.model is None:
            print(f"Loading embedding model: {self.model_name}")
            self.model = SentenceTransformer(self.model_name)
    
    def _chunk_text(self, text: str, filename: str) -> List[Dict[str, Any]]:
        """
        Split text into chunks with overlap
        
        Args:
            text: Text to split
            filename: Source filename for metadata
            
        Returns:
            List of dictionaries with chunks and metadata
        """
        chunks = []
        
        # Clean the text (remove excessive whitespace, normalize newlines)
        text = re.sub(r'\s+', ' ', text)
        
        # Split into sentences (simple approximation)
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        current_chunk = ""
        for sentence in sentences:
            # If adding this sentence would exceed chunk size and we already have content
            if len(current_chunk) + len(sentence) > self.chunk_size and current_chunk:
                # Store the chunk
                chunk_data = {
                    "content": current_chunk.strip(),
                    "metadata": {
                        "source": filename,
                        "start_char": len(current_chunk) - self.chunk_size if len(current_chunk) > self.chunk_size else 0
                    }
                }
                chunks.append(chunk_data)
                
                # Start new chunk with overlap
                overlap_start = max(0, len(current_chunk) - self.chunk_overlap)
                current_chunk = current_chunk[overlap_start:] + " " + sentence
            else:
                # Add sentence to current chunk
                current_chunk += " " + sentence
        
        # Don't forget the last chunk
        if current_chunk:
            chunk_data = {
                "content": current_chunk.strip(),
                "metadata": {
                    "source": filename,
                    "start_char": len(current_chunk) - self.chunk_size if len(current_chunk) > self.chunk_size else 0
                }
            }
            chunks.append(chunk_data)
        
        return chunks
    
    def build_index(self, force_rebuild: bool = False):
        """
        Process textbooks and build FAISS index
        
        Args:
            force_rebuild: If True, rebuild the index even if it exists
        """
        index_file = os.path.join(self.index_dir, "faiss.index")
        metadata_file = os.path.join(self.index_dir, "metadatas.jsonl")
        chunks_file = os.path.join(self.chunk_dir, "chunks.jsonl")
        
        # If index exists and we're not forcing a rebuild, load existing index
        if os.path.exists(index_file) and os.path.exists(metadata_file) and not force_rebuild:
            print("Loading existing index...")
            self.index = faiss.read_index(index_file)
            
            with open(metadata_file, 'r') as f:
                self.metadatas = [json.loads(line) for line in f]
                
            with open(chunks_file, 'r') as f:
                self.chunks = [json.loads(line)["content"] for line in f]
                
            print(f"Loaded {len(self.chunks)} chunks from existing index")
            return
        
        print("Building new index...")
        start_time = time.time()
        
        # Load the model
        self._load_model()
        
        # Process all textbooks
        all_chunks = []
        for filename in os.listdir(self.textbooks_dir):
            if not filename.endswith('.txt'):
                continue
                
            file_path = os.path.join(self.textbooks_dir, filename)
            print(f"Processing {filename}...")
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    text = f.read()
                
                # Chunk the text
                file_chunks = self._chunk_text(text, filename)
                all_chunks.extend(file_chunks)
                
            except Exception as e:
                print(f"Error processing {filename}: {str(e)}")
        
        print(f"Created {len(all_chunks)} chunks from {len(os.listdir(self.textbooks_dir))} files")
        
        # Extract chunks and metadata
        self.chunks = [chunk["content"] for chunk in all_chunks]
        self.metadatas = [chunk["metadata"] for chunk in all_chunks]
        
        # Create embeddings
        print("Creating embeddings...")
        batch_size = 32  # Process in batches to manage memory
        embeddings = []
        
        for i in range(0, len(self.chunks), batch_size):
            batch = self.chunks[i:i+batch_size]
            batch_embeddings = self.model.encode(batch)
            embeddings.extend(batch_embeddings)
            
            # Print progress
            if (i // batch_size) % 10 == 0:
                print(f"Processed {i+len(batch)}/{len(self.chunks)} chunks")
        
        # Convert to numpy array
        embeddings_array = np.array(embeddings).astype('float32')
        
        # Create FAISS index
        print("Creating FAISS index...")
        dimension = embeddings_array.shape[1]  # Should be 384 for all-MiniLM-L6-v2
        self.index = faiss.IndexFlatL2(dimension)
        self.index.add(embeddings_array)
        
        # Save index, chunks, and metadata
        print("Saving index and metadata...")
        faiss.write_index(self.index, index_file)
        
        with open(metadata_file, 'w') as f:
            for metadata in self.metadatas:
                f.write(json.dumps(metadata) + '\n')
                
        with open(chunks_file, 'w') as f:
            for chunk in self.chunks:
                f.write(json.dumps({"content": chunk}) + '\n')
        
        end_time = time.time()
        print(f"Index built in {end_time - start_time:.2f} seconds")
    
    def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Search for relevant chunks using the query
        
        Args:
            query: Search query
            top_k: Number of results to return
            
        Returns:
            List of dictionaries with content and metadata
        """
        # Ensure model is loaded
        self._load_model()
        
        # Ensure index is loaded
        if self.index is None:
            self.build_index()
        
        # Encode the query
        query_embedding = self.model.encode([query])[0].reshape(1, -1).astype('float32')
        
        # Search the index
        distances, indices = self.index.search(query_embedding, top_k)
        
        # Prepare results
        results = []
        for i, idx in enumerate(indices[0]):
            if idx != -1 and idx < len(self.chunks):  # -1 means no result
                results.append({
                    "content": self.chunks[idx],
                    "metadata": self.metadatas[idx],
                    "score": float(1.0 / (1.0 + distances[0][i]))  # Convert distance to similarity score
                })
        
        return results
        
    def answer(self, question: str, k: int = 5) -> Tuple[str, List[Dict[str, Any]], List[float]]:
        """
        Retrieve relevant chunks for a question
        
        Args:
            question: The question to answer
            k: Number of chunks to retrieve
            
        Returns:
            Tuple containing:
            - The context text for the LLM
            - List of retrieved passages
            - List of relevance scores
        """
        # Retrieve relevant chunks
        search_results = self.search(question, top_k=k)
        
        # Prepare context for LLM
        context = ""
        for i, result in enumerate(search_results):
            context += f"\nPassage {i+1}:\n{result['content']}\n"
            
        # Extract relevant passages and scores
        passages = [{"title": result["metadata"]["source"], 
                    "content": result["content"]} 
                    for result in search_results]
        
        scores = [result["score"] for result in search_results]
        
        return context, passages, scores