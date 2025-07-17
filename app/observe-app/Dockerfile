# === Base image with Node
FROM node:23.11.0-alpine AS deps
WORKDIR /app

# Copy only package files first
COPY package*.json ./
COPY tsconfig.json ./
COPY next.config.ts ./

RUN npm install

# === Builder stage
FROM node:23.11.0-alpine AS builder
WORKDIR /app

COPY --from=deps /app ./
COPY . .

RUN npm run build

# === Production runtime
FROM node:23.11.0-alpine AS runner
WORKDIR /app

COPY --from=builder /app ./

EXPOSE 3000
CMD ["npm", "start"]
