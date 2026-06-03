FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends icecast2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --home /var/log/icecast2 --create-home --uid 10001 --gid icecast icecast \
    && chown -R icecast:icecast /var/log/icecast2 /etc/icecast2 /usr/share/icecast2

COPY icecast.xml /etc/icecast2/icecast.xml

USER icecast

EXPOSE 8000

CMD ["icecast2", "-c", "/etc/icecast2/icecast.xml"]