FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

EXPOSE 4100

CMD ["node", "dist/index.js"]
