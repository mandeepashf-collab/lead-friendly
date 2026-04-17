FROM python:3.11-slim

# System dependencies for audio processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent worker code
COPY . .

# Run the agent worker
CMD ["python", "main.py", "start"]
