FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY server ./server
COPY shared ./shared
COPY src ./src
COPY tsconfig.json ./
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "--import", "tsx", "server/index.ts"]
