FROM node:24-alpine
# openssl reads the .pfx (key and certificate for signing).
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY migrations ./migrations
COPY src ./src
ENV NODE_ENV=production DATABASE_PATH=/data/emissor-nfse.db PORT=8080
# The database lives here: mount a volume so it survives new images. The server runs as `node`, so it owns the folder.
RUN mkdir /data && chown node:node /data
VOLUME /data
EXPOSE 8080
USER node
# The legacy provider lets the TLS client load older .pfx files (RC2/3DES), which many A1 certificates still are.
CMD ["node", "--openssl-legacy-provider", "--disable-warning=ExperimentalWarning", "src/server.ts"]
