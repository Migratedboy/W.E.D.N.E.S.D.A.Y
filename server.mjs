// ==========================================
// 1. CORE IMPORTS & DEPENDENCIES
// ==========================================
import path from 'node:path';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import readline from 'node:readline';

// ==========================================
// 2. SERVER CONFIG
// ==========================================
const __filename = String(import.meta.url).startsWith('file://')
  ? decodeURIComponent(String(import.meta.url).slice(process.platform === 'win32' ? 8 : 7))
  : import.meta.url;
const __dirname = path.dirname(__filename);

const runtimeEnv = typeof process !== "undefined" ? process.env : {};
const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(runtimeEnv.PORT || 4173);
const env = loadEnv(join(root, ".env"));
const apiKey = env.AI_API_KEY || runtimeEnv.AI_API_KEY || "";
const baseUrl = stripSlash(env.AI_API_BASE_URL || runtimeEnv.AI_API_BASE_URL || "https://openrouter.ai/api/v1");
const model = env.AI_MODEL || runtimeEnv.AI_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const nasaApiKey = env.NASA_API_KEY || "DEMO_KEY";

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif"
};

const imagesDir = join(root, "public", "generated_images");
if (!existsSync(imagesDir)) {
  mkdirSync(imagesDir, { recursive: true });
}

// ==========================================
// 3. CREATE READLINE INTERFACE FOR ENTER KEY
// ==========================================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ==========================================
// 4. START SERVER
// ==========================================
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { aiConfigured: Boolean(apiKey), model });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/assistant") {
    await handleAssistant(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/generate-project") {
    await handleGenerateProject(req, res);
    return;
  }

  serveStatic(url.pathname, res);
});

// Extend server timeout to 5 minutes for long AI generation requests
server.timeout = 300000;
server.keepAliveTimeout = 310000;

server.listen(port, "127.0.0.1", () => {
  const serverUrl = `http://127.0.0.1:${port}/`;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                                                              ║');
  console.log('║        ██╗  ██╗██████╗ ██╗████████╗██╗██╗  ██╗ █████╗       ║');
  console.log('║        ██║ ██╔╝██╔══██╗██║╚══██╔══╝██║██║ ██╔╝██╔══██╗      ║');
  console.log('║        █████╔╝ ██████╔╝██║   ██║   ██║█████╔╝ ███████║      ║');
  console.log('║        ██╔═██╗ ██╔══██╗██║   ██║   ██║██╔═██╗ ██╔══██║      ║');
  console.log('║        ██║  ██╗██║  ██║██║   ██║   ██║██║  ██╗██║  ██║      ║');
  console.log('║        ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝   ╚═╝   ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝      ║');
  console.log('║                                                              ║');
  console.log('║              W.E.N.E.S.D.A.Y  AI  WORKSPACE                    ║');
  console.log('║                                                              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  🚀 Server running at: ${serverUrl.padEnd(36)}║`);
  console.log('');
  if (nasaApiKey === "DEMO_KEY") {
    console.log('⚠️  NASA_API_KEY not detected — using public DEMO_KEY (rate-limited, ~30 req/hr).');
  } else {
    console.log(`✅ NASA_API_KEY loaded: ${nasaApiKey.slice(0, 4)}...${nasaApiKey.slice(-4)} (length ${nasaApiKey.length})`);
  }
  console.log('║                                                              ║');
  console.log('║  📋 Commands:                                                ║');
  console.log('║    "Let\'s go to lab"  →  Enter AI Sphere Mode               ║');
  console.log('║    "Open [website]"   →  Open in workspace                  ║');
  console.log('║    "Space photo"      →  NASA Astronomy Picture             ║');
  console.log('║    "Satellite image"  →  Live satellite view                ║');
  console.log('║                                                              ║');
  console.log('║  ⌨️  Shortcuts:                                              ║');
  console.log('║    Ctrl+L  →  Toggle Lab Mode                               ║');
  console.log('║    Ctrl+G  →  Toggle Gesture Control                        ║');
  console.log('║    ESC     →  Exit Lab Mode                                 ║');
  console.log('║                                                              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║                                                              ║');
  console.log('║  ⏳ Press [ENTER] to open W.E.D.E.N.S.D.A.Y in your browser     ║');
  console.log('║                                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  rl.question('▶  Press ENTER to launch W.E.D.N.E.S.D.A.Y ... ', () => {
    console.log('\n🚀 Launching W.E.D.N.E.S.D.A.Y AI Workspace...');
    openBrowser(serverUrl);
    rl.close();
  });
});

// ==========================================
// 5. OPEN BROWSER FUNCTION
// ==========================================
function openBrowser(url) {
  const platform = process.platform;
  let command;

  if (platform === 'win32') {
    command = `start ${url}`;
  } else if (platform === 'darwin') {
    command = `open ${url}`;
  } else {
    command = `xdg-open ${url}`;
  }

  exec(command, (error) => {
    if (error) {
      console.log(`\n⚠️  Could not open browser automatically. Please open: ${url}`);
    } else {
      console.log(`\n✅ W.E.D.N.E.S.D.A.Y is now open in your browser!`);
      console.log(`📍 ${url}`);
      console.log('\n💡 Tip: Say "Let\'s go to lab" to enter the AI sphere mode');
    }
  });
}

// ==========================================
// 6. HANDLE SERVER SHUTDOWN
// ==========================================
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down W.E.D.N.E.S.D.A.Y ...');
  rl.close();
  process.exit(0);
});

// ==========================================
// 7. API HANDLERS
// ==========================================
async function fetchWebSearch(query) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    if (!response.ok) return "";
    const html = await response.text();
    const snippets = [];
    const regex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null && snippets.length < 4) {
      const cleanSnippet = match[1].replace(/<[^>]*>/g, "").replace(/"/g, '"').replace(/&/g, '&').trim();
      if (cleanSnippet) snippets.push(cleanSnippet);
    }
    if (snippets.length === 0) return "";
    let contextBlock = "\n\n[Live Web Search Context Data]:\n";
    snippets.forEach((snippet, idx) => { contextBlock += `\nSource Snippet #${idx + 1}:\n${snippet}\n`; });
    return contextBlock;
  } catch (err) {
    return "";
  }
}

async function handleAssistant(req, res) {
  if (!apiKey) {
    sendJson(res, 503, { error: "AI_API_KEY is not configured." });
    return;
  }

  const historyFilePath = join(root, "history.json");

  try {
    const body = JSON.parse(await readBody(req));
    let prompt = String(body.prompt || "").trim();
    const attachedFile = body.file;

    if (!prompt && !attachedFile) {
      sendJson(res, 400, { error: "Prompt or file is required." });
      return;
    }

    const lowerPrompt = prompt.toLowerCase();

    // ==========================================
    // NASA SPACE PHOTO
    // ==========================================
    if (lowerPrompt.startsWith("space photo")) {
      try {
        const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${nasaApiKey}`);
        const data = await response.json();
        if (response.ok && data.url) {
          sendJson(res, 200, {
            reply: `### 🌌 NASA Space Photo of the Day\n\n**Title:** ${data.title}\n\n![NASA Photo](${data.url})\n\n**Description:** ${data.explanation}`
          });
          return;
        }
        sendJson(res, 502, { error: "NASA APOD did not return a usable image today." });
        return;
      } catch (err) {
        sendJson(res, 500, { error: `NASA APOD failed: ${err.message}` });
        return;
      }
    }

    // ==========================================
    // NASA EPIC PHOTO
    // ==========================================
    if (lowerPrompt.startsWith("epic photo")) {
      try {
        const response = await fetch(`https://api.nasa.gov/EPIC/api/natural?api_key=${nasaApiKey}`);
        const data = await response.json();
        if (response.ok && data && data.length > 0) {
          const targetRecord = data[0];
          const imgId = targetRecord.image;
          const dateObj = new Date(targetRecord.date);
          const yyyy = dateObj.getFullYear();
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(dateObj.getDate()).padStart(2, '0');
          const epicImgUrl = `https://api.nasa.gov/EPIC/archive/natural/${yyyy}/${mm}/${dd}/png/${imgId}.png?api_key=${nasaApiKey}`;
          sendJson(res, 200, {
            reply: `### 🌎 NASA EPIC Live Full-Disc Planetary Stream\n\nCaptured by DSCOVR Satellite\n\n**Capture Timestamp:** ${targetRecord.date}\n\n![NASA EPIC](${epicImgUrl})`
          });
          return;
        }
        sendJson(res, 502, { error: "NASA EPIC has no recent imagery available." });
        return;
      } catch (err) {
        sendJson(res, 500, { error: `NASA EPIC failed: ${err.message}` });
        return;
      }
    }

    // ==========================================
    // NASA MARS PHOTO
    // ==========================================
    if (lowerPrompt.startsWith("mars photo")) {
      try {
        const response = await fetch(`https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos?sol=1000&page=1&api_key=${nasaApiKey}`);
        const rawText = await response.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch {
          // NASA returned HTML/plain-text instead of JSON — usually a rate-limit
          // or gateway error page, not something response.json() can parse.
          sendJson(res, 502, {
            error: `NASA Mars API returned a non-JSON response (status ${response.status}). This usually means rate-limiting or a temporary outage. Raw start: ${rawText.slice(0, 120).replace(/\s+/g, " ")}`
          });
          return;
        }
        if (response.ok && data.photos && data.photos.length > 0) {
          const lookupIdx = Math.floor(Math.random() * Math.min(data.photos.length, 15));
          const targetPhoto = data.photos[lookupIdx];
          sendJson(res, 200, {
            reply: `### ☄️ Mars Surface Telemetry\n\n**Rover:** ${targetPhoto.rover.name}\n**Camera:** ${targetPhoto.camera.full_name}\n**Sol:** ${targetPhoto.sol}\n\n![Mars Rover](${targetPhoto.img_src})`
          });
          return;
        }
        sendJson(res, 502, { error: data.error?.message || data.errors || "Mars rover photo feed returned no images for that sol." });
        return;
      } catch (err) {
        sendJson(res, 500, { error: `Mars telemetry failed: ${err.message}` });
        return;
      }
    }

    // ==========================================
    // SATELLITE IMAGE
    // ==========================================
    if (lowerPrompt.includes("satellite image of")) {
      try {
        const index = lowerPrompt.indexOf("satellite image of");
        let locationQuery = prompt.slice(index + "satellite image of".length).trim();
        let lat, lon;

        const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationQuery)}&format=json&limit=1`;
        const geoResponse = await fetch(geocodeUrl, {
          headers: {
            "User-Agent": "Personal-AI-Console-App",
            "Referer": "http://127.0.0.1"
          }
        });

        if (!geoResponse.ok) {
          sendJson(res, 500, { error: "Geocoding service failed." });
          return;
        }

        const geoData = await geoResponse.json();
        if (geoData && geoData.length > 0) {
          lat = parseFloat(geoData[0].lat);
          lon = parseFloat(geoData[0].lon);
          locationQuery = geoData[0].display_name.split(',')[0];
        } else {
          sendJson(res, 404, { error: `Could not find "${locationQuery}".` });
          return;
        }

        const mapId = `map_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

        // NOTE: built via string concatenation rather than a literal "<script>...</script>"
        // inside this template — a literal closing tag here would prematurely terminate
        // whatever outer <script> this reply gets injected into on the client.
        const scriptOpen = '<scr' + 'ipt>';
        const scriptClose = '</scr' + 'ipt>';

        const htmlMapApp = `
<div style="background:#0b1329; border:2px solid #00e5ff; border-radius:8px; padding:15px; font-family:monospace; color:#00e5ff; margin:15px 0; max-width:100%;">
  <div style="font-size:15px; font-weight:bold; border-bottom:1px solid #00b0ff; padding-bottom:6px; margin-bottom:10px; display:flex; justify-content:space-between;">
    <span>🛰️ SATELLITE IMAGERY</span>
    <span style="color:#00e5ff;">● LIVE</span>
  </div>
  <div style="font-size:12px; color:#94a3b8; margin-bottom:10px;">
    <strong>TARGET:</strong> ${locationQuery.toUpperCase()}<br/>
    <strong>COORDINATES:</strong> LAT ${lat.toFixed(4)} / LON ${lon.toFixed(4)}
  </div>
  <div id="${mapId}" style="width:100%; height:320px; background:#020617; border-radius:4px; border:1px solid #1e293b; overflow:hidden;"></div>
  ${scriptOpen}
    (function() {
      const targetId = "${mapId}";
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      function buildInstance() {
        const el = document.getElementById(targetId);
        if (!el || el._leaflet_id) return;
        const map = L.map(targetId, { preferCanvas: true, zoomControl: false }).setView([${lat}, ${lon}], 14);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Tiles &copy; Esri',
          maxZoom: 18
        }).addTo(map);
        L.circleMarker([${lat}, ${lon}], {
          color: '#00e5ff',
          radius: 7,
          fillColor: '#00e5ff',
          fillOpacity: 0.9,
          weight: 2
        }).addTo(map);
        setTimeout(() => { map.invalidateSize(); }, 50);
        setTimeout(() => { map.invalidateSize(); }, 350);
      }
      if (typeof L !== 'undefined') {
        setTimeout(buildInstance, 60);
      } else if (!document.getElementById('leaflet-js')) {
        const script = document.createElement('script');
        script.id = 'leaflet-js';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => { setTimeout(buildInstance, 60); };
        document.head.appendChild(script);
      } else {
        const structuralCheck = setInterval(() => {
          if (typeof L !== 'undefined') {
            clearInterval(structuralCheck);
            setTimeout(buildInstance, 60);
          }
        }, 30);
      }
    })();
  ${scriptClose}
</div>`;

        sendJson(res, 200, { reply: `### Satellite Imagery: ${locationQuery}\n${htmlMapApp}` });
        return;
      } catch (err) {
        console.error(err);
        sendJson(res, 500, { error: "Satellite ingestion failed." });
        return;
      }
    }

    // ==========================================
    // WEB SEARCH CONTEXT
    // ==========================================
    let searchContext = "";
    const searchTriggers = ["search", "weather", "news", "latest", "today", "who is"];
    const needsSearch = searchTriggers.some(trigger => lowerPrompt.includes(trigger));
    if (needsSearch && !attachedFile) {
      searchContext = await fetchWebSearch(prompt);
    }

    // ==========================================
    // AI CHAT
    // ==========================================
    let conversationHistory = [];
    if (existsSync(historyFilePath)) {
      try { conversationHistory = JSON.parse(readFileSync(historyFilePath, "utf8")); } catch (e) { conversationHistory = []; }
    }

    let currentUserMessage;
    if (attachedFile) {
      if (attachedFile.type.startsWith("image/")) {
        currentUserMessage = {
          role: "user",
          content: [
            { type: "text", text: prompt || "Analyze this image." },
            { type: "image_url", image_url: { url: attachedFile.data } }
          ]
        };
      } else {
        currentUserMessage = {
          role: "user",
          content: `The user attached a file named "${attachedFile.name}".\n[File Contents]\n\`\`\`\n${attachedFile.data}\n\`\`\`\n\nInstructions: ${prompt}`
        };
      }
    } else {
      currentUserMessage = { role: "user", content: prompt + searchContext };
    }

    conversationHistory.push({ role: "user", content: prompt });
    if (conversationHistory.length > 20) { conversationHistory = conversationHistory.slice(-20); }

    // Lab Mode sends prompts prefixed with "[Lab Mode]" from the Lab Chat panel.
    // It needs a different system prompt that forces structured FILE:+codeblock
    // output, which the frontend (applyLabAIReply) parses and writes to disk.
    const isLabMode = prompt.startsWith("[Lab Mode]");

    const labSystemPrompt =
      "You are an embedded coding assistant inside a live code editor called W.E.D.N.E.S.D.A.Y Lab. " +
      "The user is working on a small web project (HTML/CSS/JS files). " +
      "When asked to create or edit code, you MUST respond in this exact format for every file you touch: " +
      "a line reading exactly 'FILE: <filename>' followed immediately by a single fenced code block containing the COMPLETE file content (not a diff, not a snippet — the whole file, fully working). " +
      "You may add one short sentence of plain-text summary before the FILE blocks, but no other commentary, and no code outside of FILE blocks. " +
      "If the user is just asking a question and not asking you to write/edit code, reply normally in plain text with no FILE blocks. " +
      "If you were given the current content of a file as context, edit that exact file rather than starting over, unless asked to start fresh.";

    const generalSystemPrompt =
      "You are W.E.D.N.E.S.D.A.Y, a helpful personal AI assistant. Be concise, helpful, and futuristic in your responses.";

    const openRouterMessages = [
      {
        role: "system",
        content: isLabMode ? labSystemPrompt : generalSystemPrompt
      },
      ...conversationHistory
    ];

    openRouterMessages[openRouterMessages.length - 1] = currentUserMessage;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "http-referer": `http://127.0.0.1:${port}`,
        "x-title": "W.E.D.N.E.S.D.A.Y AI"
      },
      body: JSON.stringify({ model, messages: openRouterMessages, temperature: 0.6 })
    });

    const data = await response.json();
    if (!response.ok) {
      sendJson(res, response.status, { error: data.error?.message || "AI request failed." });
      return;
    }

    const reply = cleanAssistantReply(data.choices?.[0]?.message?.content || "");
    conversationHistory.push({ role: "assistant", content: reply });
    writeFileSync(historyFilePath, JSON.stringify(conversationHistory, null, 2), "utf8");

    sendJson(res, 200, { reply });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error." });
  }
}

// ==========================================
// GENERATE PROJECT - AI multi-file builder
// ==========================================
async function handleGenerateProject(req, res) {
  if (!apiKey) {
    sendJson(res, 503, { error: "AI_API_KEY is not configured." });
    return;
  }
  try {
    const body = JSON.parse(await readBody(req));
    const prompt = String(body.prompt || "").trim();
    const folderName = String(body.folderName || "my-project").trim().replace(/[^a-zA-Z0-9_\-]/g, '-');

    if (!prompt) {
      sendJson(res, 400, { error: "Prompt is required." });
      return;
    }

    const systemPrompt =
      "You are W.E.D.N.E.S.D.A.Y, an expert web developer AI. " +
      "The user wants you to build a complete, fully working web project from scratch. " +
      "You MUST respond ONLY with file blocks — no explanations, no commentary outside blocks. " +
      "For EVERY file in the project, output a line reading exactly 'FILE: <filename>' followed immediately by a single fenced code block with the COMPLETE file content. " +
      "Always include ALL necessary files. For a game or app: at minimum index.html, style.css, and script.js as separate files. " +
      "For complex projects add more files as needed. " +
      "Every file must be complete, production-quality, and fully functional — no placeholders, no TODO comments, no stubs. " +
      "Link CSS and JS files properly inside index.html using relative paths.";

    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 240000); // 4 min

    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: aiController.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "http-referer": `http://127.0.0.1:${port}`,
          "x-title": "W.E.D.N.E.S.D.A.Y AI"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Build this project: " + prompt }
          ],
          temperature: 0.5,
          max_tokens: 4000
        })
      });
    } catch (fetchErr) {
      clearTimeout(aiTimeout);
      if (fetchErr.name === "AbortError") {
        sendJson(res, 504, { error: "AI took too long to respond (>4 min). Try a simpler project first." });
      } else {
        sendJson(res, 502, { error: "Could not reach AI API: " + fetchErr.message });
      }
      return;
    }
    clearTimeout(aiTimeout);

    const data = await response.json();
    if (!response.ok) {
      sendJson(res, response.status, { error: data.error?.message || "AI request failed." });
      return;
    }

    const reply = cleanAssistantReply(data.choices?.[0]?.message?.content || "");

    // Parse FILE blocks
    const fileRegex = /FILE:\s*([^\n`]+)\s*\n```[a-zA-Z]*\n([\s\S]*?)```/g;
    const files = [];
    let match;
    while ((match = fileRegex.exec(reply)) !== null) {
      files.push({ filename: match[1].trim(), code: match[2].replace(/\s+$/, '') });
    }

    if (files.length === 0) {
      sendJson(res, 200, { error: "AI did not return any files. Try a more specific prompt.", rawReply: reply });
      return;
    }

    // Save files to disk under projects/<folderName>/
    const projectsDir = join(root, "projects");
    const projectDir = join(projectsDir, folderName);
    if (!existsSync(projectsDir)) mkdirSync(projectsDir, { recursive: true });
    if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });

    const savedFiles = [];
    for (const file of files) {
      // Safety: only allow simple filenames (no path traversal)
      const safeName = file.filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
      const filePath = join(projectDir, safeName);
      writeFileSync(filePath, file.code, 'utf8');
      savedFiles.push({ filename: safeName, code: file.code });
    }

    sendJson(res, 200, {
      success: true,
      folderName,
      files: savedFiles,
      message: `Generated ${savedFiles.length} file(s) in projects/${folderName}/`
    });

  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error." });
  }
}

function serveStatic(pathname, res) {
  const decodedPath = decodeURIComponent(pathname);
  const target = resolve(join(root, decodedPath));
  if (!target.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  const file = existsSync(target) && statSync(target).isDirectory() ? join(target, "index.html") : target;
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": mime[extname(file).toLowerCase()] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        if (index === -1) return [line, ""];
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        // strip matching surrounding quotes, e.g. NASA_API_KEY="abc123"
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
  );
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 2000000) req.destroy(); });
    req.on("end", () => resolveBody(body));
    req.on("error", rejectBody);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function stripSlash(value) { return value.replace(/\/$/, ""); }

function cleanAssistantReply(value) {
  return String(value)
    .replace(/<tool_call[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<\/?(?:tool_call|arg_key|arg_value)[^>]*>/gi, "")
    .replace(/`{1,3}\s*tool_code[\s\S]*?`{1,3}/gi, "")
    .replace(/^\s*tool_code\b.*$/gim, "")
    .trim();
}

