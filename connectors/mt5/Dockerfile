FROM debian:bookworm-slim
RUN dpkg --add-architecture i386 \
    && apt-get update && apt-get install -y --no-install-recommends wget gnupg ca-certificates \
    && wget -qO /tmp/winehq.key https://dl.winehq.org/wine-builds/winehq.key \
    && gpg --dearmor -o /usr/share/keyrings/winehq.gpg /tmp/winehq.key \
    && echo 'deb [signed-by=/usr/share/keyrings/winehq.gpg] https://dl.winehq.org/wine-builds/debian/ bookworm main' > /etc/apt/sources.list.d/winehq.list \
    && apt-get update && apt-get install -y --install-recommends winehq-staging \
    && apt-get install -y --no-install-recommends xvfb python3 fonts-liberation openbox x11vnc \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 connector && mkdir /work && chown connector:connector /work
# Setup-only browser access; keep the large Wine dependency layer reusable.
RUN apt-get update && apt-get install -y --no-install-recommends novnc websockify \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY connectors/mt5/worker.py connectors/mt5/setup.py connectors/mt5/EazyJournal.mq5 ./
USER connector
ENV WINEDEBUG=-all PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
CMD ["python3", "/app/worker.py"]
