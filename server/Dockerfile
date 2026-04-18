FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=5174 XC_DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 5174
VOLUME ["/data"]
CMD ["node", "src/index.js"]
