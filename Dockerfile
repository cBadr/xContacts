# ---------- Builder ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV CI=1

COPY package*.json ./
COPY server/package*.json server/
COPY client/package*.json client/

RUN npm install --ignore-scripts --no-audit --no-fund \
 && npm --prefix server install --omit=dev --no-audit --no-fund \
 && npm --prefix client install --include=dev --no-audit --no-fund

COPY . .
RUN npm --prefix client run build

# ---------- Runtime ----------
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5174 \
    HOST=0.0.0.0 \
    XC_DATA_DIR=/data

RUN mkdir -p /data && chown -R node:node /data

# Copy only what we need to run: the server source + its installed modules,
# plus the pre-built client bundle. No build tools in the final image.
COPY --from=builder --chown=node:node /app/package.json .
COPY --from=builder --chown=node:node /app/server ./server
COPY --from=builder --chown=node:node /app/client/dist ./client/dist

USER node
EXPOSE 5174
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5174)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
