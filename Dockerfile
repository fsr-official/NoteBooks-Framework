FROM node:18-bullseye-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build --if-present || true
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "./dist/server/server.js"]
