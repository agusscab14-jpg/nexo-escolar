FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ARG NEXO_RELEASE
RUN if [ -n "$NEXO_RELEASE" ]; then \
      printf '%s\n' "$NEXO_RELEASE" > /app/BUILD_REVISION; \
    else \
      { find config core static deploy -type f -print0; printf '%s\0' requirements.txt Caddyfile Caddyfile.server docker-compose.yml docker-compose.server.yml docker-compose.test.yml; } \
        | sort -z | xargs -0 sha256sum | sha256sum | cut -d ' ' -f 1 > /app/BUILD_REVISION; \
    fi \
 && chmod +x deploy/entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/app/deploy/entrypoint.sh"]
