FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
ENV PORT=8787 DATA_DIR=/data HOST=0.0.0.0
EXPOSE 8787
VOLUME /data
CMD ["node", "server.mjs"]
