# Dockerfile
FROM node:23.11.0-alpine AS builder

WORKDIR /app
COPY . .

# Install dependencies and build
RUN npm install
RUN npm run build

# Production image
FROM node:23.11.0-alpine

WORKDIR /app
COPY --from=builder /app ./

EXPOSE 3000
CMD ["npm", "start"]
