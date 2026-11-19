FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY build.mjs ./
COPY ui ./ui
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
ENV PATH="/opt/venv/bin:${PATH}" BAMBOLBI_MODE=server
COPY app.py server.mjs demo.mjs validate_media.py ./
COPY static ./static
COPY --from=frontend /app/static/app.js /app/static/app.js
RUN mkdir runtime && chown node:node runtime
USER node
CMD ["python", "app.py"]
