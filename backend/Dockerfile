FROM python:3.12-slim

WORKDIR /app

# Copy all source first so pip install can find the package
COPY pyproject.toml .
COPY app/ app/

# Install dependencies
RUN pip install --no-cache-dir .

# Run data pipeline at build time to bake ChromaDB into the image
RUN python -m app.data.pipeline.runner

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
