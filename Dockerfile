FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
EXPOSE 3456 3457 3458
CMD ["node", "src/main/index.js"]
