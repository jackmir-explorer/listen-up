# listen-up 백엔드 단일 이미지 (Anthropic analyze + YouTube search/transcript/import)
# 프런트(listen-up.html)도 "/" 에서 함께 서빙 → 백엔드 한 곳만 호스팅해도 동작.
#
#   docker build -t listen-up-api .
#   docker run -p 3001:3001 -e ANTHROPIC_API_KEY=sk-ant-... listen-up-api
#
FROM node:20-alpine
WORKDIR /app

# 의존성 먼저 (레이어 캐시)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# 소스 + 프런트(server.js 가 ../listen-up.html 을 "/" 로 서빙)
COPY server ./server
COPY listen-up.html ./listen-up.html

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# ANTHROPIC_API_KEY 는 런타임 env 로 주입 (dotenv 는 기존 env 를 덮어쓰지 않음 → .env 불필요)
CMD ["node", "server/server.js"]
