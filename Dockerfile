FROM node:18 AS client-build
WORKDIR /client
COPY client/ .
RUN npm install && npm run build

FROM node:18
WORKDIR /app
COPY server/ ./server
COPY --from=client-build /client/dist ./client/dist
WORKDIR /app/server
RUN npm install
EXPOSE 5000
CMD ["node", "server.js"]
