FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY demo-data ./demo-data
COPY *.js *.html *.css ./
COPY dist ./dist
ENV HOST=0.0.0.0 PORT=8787 NODE_ENV=production
USER node
EXPOSE 8787
CMD ["node", "server/start.mjs"]
