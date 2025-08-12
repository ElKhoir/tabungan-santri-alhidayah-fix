FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data

# Install build tools for better-sqlite3
RUN apk add --no-cache python3 make g++ \
 && npm config set python /usr/bin/python3

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN mkdir -p ${DATA_DIR}

USER node
EXPOSE 3000
CMD ["node","server.js"]
