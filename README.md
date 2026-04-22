# Graph Intelligence System

Upload messy CSVs, store extracted entities in Telegram, and explore relationships in an interactive graph UI.

## Architecture

```text
CSV Files -> Uploader -> Telegram Group -> Backend API -> React Flow UI
```

- Uploader: Node script that parses CSV rows and pushes normalized JSON to Telegram.
- Telegram Group: acts as a low-cost message-backed data store.
- Backend: graph builder + REST API with in-memory caching.
- Frontend: React + React Flow visualization with expansion controls.

## Project Structure

```text
graph-intel/
|-- uploader/
|   |-- upload.js
|   |-- package.json
|   `-- data/
|-- backend/
|   |-- server.js
|   |-- package.json
|   `-- .env.example
|-- frontend/
|   |-- src/
|   |   |-- App.jsx
|   |   |-- main.jsx
|   |   `-- components/
|   |       |-- GraphView.jsx
|   |       |-- EntityNode.jsx
|   |       |-- NodePanel.jsx
|   |       |-- SearchBar.jsx
|   |       `-- StatsBar.jsx
|   |-- index.html
|   |-- vite.config.js
|   `-- package.json
|-- render.yaml
`-- README.md
```

## Setup Notes (WSL Ubuntu)

- Run all project commands from WSL Ubuntu.
- Use your preferred package manager in WSL to install dependencies.
- Copy `.env.example` files to `.env` and set Telegram credentials:
  - `BOT_TOKEN`
  - `CHAT_ID`

## Local Run Flow

1. Put CSV files inside `uploader/data/`.
2. Start uploader from `uploader` (executes `upload.js`).
3. Start backend from `backend` (serves API on `http://localhost:3001` by default).
4. Start frontend from `frontend` (serves the graph client, defaults to Vite local port).

## API

- `GET /graph?value=<seed>&depth=<1-5>`
- `GET /search?q=<query>`
- `GET /stats`
- `POST /webhook`
- `POST /sync`

## Render Deployment (Backend + Frontend)

Use `render.yaml` (Blueprint deploy) or create services manually.

### 1) Backend service (`backend`, Web Service)

- Runtime: Node
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Set these environment variables in Render:

- `BOT_TOKEN` = your Telegram bot token
- `CHAT_ID` = your Telegram channel/group id (example: `-1003799313385`)
- `PORT` = `3001`
- `MAX_NODES` = `400000`
- `NODE_ENV` = `production`
- `WEBHOOK_URL` = `https://<your-backend-service>.onrender.com`

After first deploy, set webhook once:

- Open: `https://<your-backend-service>.onrender.com/webhook/set?url=https://<your-backend-service>.onrender.com`

### 2) Frontend service (`frontend`, Static Site)

- Runtime: Static Site
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

Set this environment variable in Render:

- `VITE_API_URL` = `https://<your-backend-service>.onrender.com`

### 3) Telegram requirements

- Bot must be admin in your target channel/group
- If using groups and reading all messages, disable bot privacy in BotFather

### 4) Quick post-deploy checks

- Backend health: `GET /`
- Stats: `GET /stats`
- Graph query: `GET /graph?value=<known_value>&depth=2`
