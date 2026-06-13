FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache dumb-init ca-certificates

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
