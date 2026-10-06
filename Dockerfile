# ---------- build: frontend (Vite) + backend (esbuild) ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json frontend/
RUN npm --prefix frontend ci
COPY backend/package*.json backend/
RUN npm --prefix backend ci
COPY frontend frontend
COPY backend backend
# The app talks to the API on the same origin.
ENV VITE_USE_MOCK=false VITE_API_BASE_URL=/api
RUN npm --prefix frontend run build && npm --prefix backend run build

# ---------- run: one Node process serves the API and the app ----------
FROM node:20-alpine
WORKDIR /app/backend
ENV NODE_ENV=production PORT=8000 FRONTEND_DIST=../frontend/dist
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/dist ../frontend/dist
EXPOSE 8000
CMD ["node", "dist/server.mjs"]
