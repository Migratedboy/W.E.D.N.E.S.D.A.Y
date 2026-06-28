# Personal AI Console

Run the local assistant server from this folder:

```powershell
node server.mjs
```

Then open:

```text
http://127.0.0.1:4173/
```

The browser app calls `/api/assistant`; the server reads the private key from `.env` and sends requests to the configured OpenAI-compatible chat endpoint. The default config uses OpenRouter with `poolside/laguna-xs.2:free`.
