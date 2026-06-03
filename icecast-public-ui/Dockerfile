FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache sqlite
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --production
COPY . .
EXPOSE 3000
CMD ["node","server.js"]
