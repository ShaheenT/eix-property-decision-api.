FROM mcr.microsoft.com/playwright:v1.49.1-noble
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
ENV NODE_ENV=production PORT=8080 PW_NO_SANDBOX=1
EXPOSE 8080
USER pwuser
CMD ["npm", "start"]
