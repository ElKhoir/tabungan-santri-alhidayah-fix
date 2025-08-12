FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data

# (opsional) alat dasar
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev     # bukan 'npm ci'

COPY . .
RUN mkdir -p ${DATA_DIR}

USER node
EXPOSE 3000
CMD ["node","server.js"]
