Prototype UI publik untuk Icecast — SPA + proxy kecil

Jalankan secara lokal:

```bash
cd icecast-public-ui
npm install
ICECAST_URL=http://127.0.0.1:8099/status-json.xsl npm start
```

Atau jalankan dengan Docker:

```bash
cd icecast-public-ui
docker build -t icecast-public-ui .
docker run -p 3000:3000 -e ICECAST_URL=http://host.docker.internal:8099/status-json.xsl icecast-public-ui
```

Akses UI: http://localhost:3000
