FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g npm@12.0.2

COPY package*.json ./

RUN npm ci --omit=dev

COPY app.js server.js schema.sql ./


FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/app.js ./app.js
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/schema.sql ./schema.sql

# npm is not required at runtime
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER node

EXPOSE 3000

CMD ["node", "server.js"]