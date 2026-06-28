const messages = document.querySelector("#messages");
const form = document.querySelector("#assistantForm");
const input = document.querySelector("#promptInput");
const micButton = document.querySelector("#micButton");
const systemLine = document.querySelector("#systemLine");
const clock = document.querySelector("#clock");
const voiceState = document.querySelector("#voiceState");
const mode = document.querySelector("#mode");
const quickPrompts = document.querySelectorAll("[data-prompt]");
const tools = document.querySelectorAll("[data-command]");
const cores = document.querySelectorAll(".core");
const core = cores[0];

function renderCoreTicks() {
  document.querySelectorAll(".core .ticks").forEach((ticksGroup) => {
    if (ticksGroup.childElementCount > 0) return;
    const cx = 100, cy = 100, rOuter = 94, rInner = 88;
    const svgNs = "http://www.w3.org/2000/svg";
    for (let i = 0; i < 36; i++) {
      const angle = (i * 10 * Math.PI) / 180;
      const x1 = cx + rInner * Math.cos(angle);
      const y1 = cy + rInner * Math.sin(angle);
      const x2 = cx + rOuter * Math.cos(angle);
      const y2 = cy + rOuter * Math.sin(angle);
      const line = document.createElementNS(svgNs, "line");
      line.setAttribute("x1", x1.toFixed(2));
      line.setAttribute("y1", y1.toFixed(2));
      line.setAttribute("x2", x2.toFixed(2));
      line.setAttribute("y2", y2.toFixed(2));
      line.setAttribute("stroke-opacity", i % 3 === 0 ? "0.9" : "0.35");
      ticksGroup.appendChild(line);
    }
  });
}
renderCoreTicks();

const attachButton = document.querySelector("#attachButton");
const fileInput = document.querySelector("#fileInput");
let attachedFile = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;
let recognition;
let preferredVoice = null;

// ============================================
// ENHANCED CLAP DETECTION WITH TAB/APP FOCUS
// ============================================
let clapDetectionActive = false;
let clapCount = 0;
let clapTimestamps = [];
const CLAP_TIMEOUT_MS = 500;
const REQUIRED_CLAPS = 2;
const AMPLITUDE_THRESHOLD = 0.55;
let clapDetectionInterval = null;
let audioContext = null;
let analyser = null;
let microphoneStream = null;
let isClapTriggering = false;
let clapTriggerCount = 0;

// Create clap indicator
const clapIndicator = document.createElement('div');
clapIndicator.id = 'clapIndicator';
clapIndicator.style.cssText = `
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 229, 255, 0.12);
  border: 1px solid rgba(0, 229, 255, 0.25);
  border-radius: 20px;
  padding: 8px 20px;
  color: #00e5ff;
  font-family: 'Rajdhani', monospace;
  font-size: 13px;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
  opacity: 0;
  pointer-events: none;
  z-index: 9999;
  letter-spacing: 0.5px;
`;
clapIndicator.textContent = '👏 Clap detection active';
document.body.appendChild(clapIndicator);

// Create clap toggle button
const clapToggleBtn = document.createElement('button');
clapToggleBtn.id = 'clapToggleBtn';
clapToggleBtn.textContent = '👏 Clap: ON';
clapToggleBtn.style.cssText = `
  position: fixed;
  top: 80px;
  right: 20px;
  background: rgba(0, 229, 255, 0.08);
  border: 1px solid rgba(0, 229, 255, 0.3);
  border-radius: 20px;
  padding: 6px 16px;
  color: #00e5ff;
  font-family: 'Rajdhani', monospace;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  z-index: 9999;
  backdrop-filter: blur(5px);
  transition: all 0.3s ease;
  letter-spacing: 0.5px;
`;
clapToggleBtn.onmouseover = () => { clapToggleBtn.style.background = 'rgba(0, 229, 255, 0.2)'; };
clapToggleBtn.onmouseout = () => { clapToggleBtn.style.background = 'rgba(0, 229, 255, 0.08)'; };
document.body.appendChild(clapToggleBtn);

// ============================================
// REQUEST PERMISSION FOR NOTIFICATIONS (to wake tab)
// ============================================
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ============================================
// FUNCTION TO BRING TAB/WINDOW TO FOCUS
// ============================================
function bringAppToFront() {
  // Method 1: Focus the window
  if (document.hidden) {
    // If tab is hidden, try to focus it
    window.focus();
  }
  
  // Method 2: Create a notification to grab attention
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification('👏 Clap Detected!', {
        body: 'The assistant is waking up...',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🤖</text></svg>',
        silent: true
      });
      setTimeout(() => notif.close(), 3000);
    } catch(e) {}
  }

  // Method 3: If app is minimized, this may restore it (Chrome)
  if (document.visibilityState === 'hidden') {
    document.addEventListener('visibilitychange', function onVisible() {
      if (!document.hidden) {
        systemLine.textContent = '👋 Welcome back! Clap detection active.';
        document.removeEventListener('visibilitychange', onVisible);
      }
    });
  }

  // Method 4: Try to use the Wake Lock API to prevent screen from dimming
  if ('wakeLock' in navigator) {
    try {
      navigator.wakeLock.request('screen').then(lock => {
        setTimeout(() => lock.release(), 5000);
      });
    } catch(e) {}
  }
}

function showClapFeedback(message, isSuccess = false) {
  clapIndicator.textContent = message;
  clapIndicator.style.opacity = '1';
  clapIndicator.style.borderColor = isSuccess ? 'rgba(0, 255, 100, 0.5)' : 'rgba(0, 229, 255, 0.25)';
  clapIndicator.style.background = isSuccess ? 'rgba(0, 255, 100, 0.1)' : 'rgba(0, 229, 255, 0.08)';
  clearTimeout(clapIndicator._hideTimeout);
  clapIndicator._hideTimeout = setTimeout(() => {
    clapIndicator.style.opacity = '0';
  }, 1500);
}

async function initClapDetection() {
  try {
    if (audioContext && audioContext.state === 'running') {
      return;
    }
    microphoneStream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      } 
    });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(microphoneStream);
    source.connect(analyser);
    clapDetectionActive = true;
    clapTimestamps = [];
    clapCount = 0;
    clapToggleBtn.textContent = '👏 Clap: ON';
    clapToggleBtn.style.borderColor = 'rgba(0, 229, 255, 0.3)';
    clapToggleBtn.style.color = '#00e5ff';
    showClapFeedback('👏 Clap detection active');
    clapIndicator.style.opacity = '0.4';
    systemLine.textContent = '👏 Clap twice to wake me up!';
    monitorClaps();
    console.log('👏 Clap detection initialized');
  } catch (err) {
    console.error('Clap detection failed:', err);
    systemLine.textContent = 'Clap detection unavailable. Use mic button.';
    clapDetectionActive = false;
    clapToggleBtn.textContent = '👏 Clap: OFF';
    clapToggleBtn.style.borderColor = 'rgba(255, 100, 100, 0.3)';
    clapToggleBtn.style.color = '#ff6b6b';
  }
}

function monitorClaps() {
  if (!clapDetectionActive || !analyser) return;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  const normalizedAmplitude = sum / dataArray.length / 255;
  if (normalizedAmplitude > AMPLITUDE_THRESHOLD && !isClapTriggering) {
    const now = Date.now();
    if (clapTimestamps.length === 0 || (now - clapTimestamps[clapTimestamps.length - 1]) > 50) {
      clapTimestamps.push(now);
      clapCount++;
      isClapTriggering = true;
      setTimeout(() => { isClapTriggering = false; }, 100);
      
      const clapFlash = document.createElement('div');
      clapFlash.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 150px;
        height: 150px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(0, 229, 255, 0.25) 0%, transparent 70%);
        pointer-events: none;
        z-index: 9998;
        animation: clapFlash 0.3s ease-out forwards;
      `;
      if (!document.getElementById('clapAnimationStyle')) {
        const style = document.createElement('style');
        style.id = 'clapAnimationStyle';
        style.textContent = `
          @keyframes clapFlash {
            0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
          }
          @keyframes clapBurst {
            0% { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }
      document.body.appendChild(clapFlash);
      setTimeout(() => clapFlash.remove(), 300);
      showClapFeedback(`👏 Clap ${clapCount} detected!`, false);
      
      if (clapCount >= REQUIRED_CLAPS) {
        const firstClapTime = clapTimestamps[0];
        const lastClapTime = clapTimestamps[clapTimestamps.length - 1];
        if (lastClapTime - firstClapTime <= CLAP_TIMEOUT_MS * REQUIRED_CLAPS) {
          handleClapTrigger();
          clapTimestamps = [];
          clapCount = 0;
        } else {
          clapTimestamps = [];
          clapCount = 0;
          showClapFeedback('👏 Clap sequence reset. Try again.', false);
        }
      }
      clearTimeout(clapDetectionInterval._resetTimeout);
      clapDetectionInterval._resetTimeout = setTimeout(() => {
        if (clapTimestamps.length > 0) {
          const lastClap = clapTimestamps[clapTimestamps.length - 1];
          if (Date.now() - lastClap > CLAP_TIMEOUT_MS) {
            clapTimestamps = [];
            clapCount = 0;
            showClapFeedback('👏 Clap detection reset', false);
          }
        }
      }, CLAP_TIMEOUT_MS + 100);
    }
  }
  clapDetectionInterval = requestAnimationFrame(monitorClaps);
}

function handleClapTrigger() {
  clapTriggerCount++;
  
  // Bring the app to front FIRST
  bringAppToFront();
  
  // Show dramatic visual feedback
  showClapFeedback('🎤 Wake up! Voice recognition activated!', true);
  
  const burst = document.createElement('div');
  burst.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(0, 229, 255, 0.4) 0%, rgba(0, 229, 255, 0) 70%);
    pointer-events: none;
    z-index: 9997;
    animation: clapBurst 0.6s ease-out forwards;
  `;
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 600);
  
  // Play a sound to indicate activation (if audio context available)
  try {
    playActivationSound();
  } catch(e) {}
  
  // If the chat isn't revealed yet, reveal it
  if (!chatRevealed) {
    revealChat();
  }
  
  // Start voice recognition or prompt user
  if (recognition) {
    try { recognition.abort(); } catch(e) {}
    setTimeout(() => {
      try { 
        recognition.start();
        systemLine.textContent = '🎤 Listening... (Clap triggered)';
      } catch(e) {
        systemLine.textContent = '👏 Clap detected! Click the mic button to speak.';
        showClapFeedback('⚠️ Click the mic button to speak', false);
        input.focus();
        input.placeholder = '👏 Clap detected! Type your command...';
        input.style.borderColor = '#00e5ff';
        setTimeout(() => {
          input.style.borderColor = '';
        }, 3000);
      }
    }, 300);
  } else {
    systemLine.textContent = '👏 Clap detected! Please type your command.';
    input.focus();
    input.placeholder = '👏 Clap detected! Type your command...';
    input.style.borderColor = '#00e5ff';
    setTimeout(() => {
      input.style.borderColor = '';
    }, 3000);
  }
}

function playActivationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

function toggleClapDetection() {
  if (clapDetectionActive) {
    clapDetectionActive = false;
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
    }
    clapIndicator.style.opacity = '0';
    clapToggleBtn.textContent = '👏 Clap: OFF';
    clapToggleBtn.style.borderColor = 'rgba(255, 100, 100, 0.3)';
    clapToggleBtn.style.color = '#ff6b6b';
    systemLine.textContent = 'Clap detection disabled. Click toggle to re-enable.';
    showClapFeedback('👏 Clap detection disabled', false);
    console.log('👏 Clap detection disabled');
  } else {
    initClapDetection();
  }
}

clapToggleBtn.addEventListener('click', toggleClapDetection);

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key === 'C') {
    event.preventDefault();
    toggleClapDetection();
  }
});

// Also wake up when page becomes visible again
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !clapDetectionActive) {
    // Try to restart clap detection when tab becomes visible
    initClapDetection().catch(() => {});
  }
});

function setCoreState(state) {
  cores.forEach((el) => {
    el.classList.remove("is-listening", "is-processing", "is-speaking");
    if (state !== "idle") {
      el.classList.add(`is-${state}`);
    }
  });
}

function injectWaveform() {
  if (document.querySelector(".waveform")) return;
  const wf = document.createElement("span");
  wf.className = "waveform";
  wf.innerHTML = "<span></span><span></span><span></span><span></span><span></span>";
  voiceState.insertAdjacentElement("afterend", wf);
  return wf;
}

const waveform = injectWaveform();

function setWaveformActive(active) {
  if (!waveform) return;
  waveform.classList.toggle("active", active);
}

const heroScreen = document.querySelector("#heroScreen");
const heroGreetingText = document.querySelector("#heroGreetingText");
const heroForm = document.querySelector("#heroForm");
const heroPromptInput = document.querySelector("#heroPromptInput");
const heroMicButton = document.querySelector("#heroMicButton");
const mainShell = document.querySelector("#mainShell");

let chatRevealed = false;
const GREETING = "Hello Yash, what could I do?";

function typeGreeting(text) {
  if (!heroGreetingText) return;
  heroGreetingText.textContent = "";
  const cursor = document.createElement("span");
  cursor.className = "typing-cursor";
  heroGreetingText.appendChild(cursor);
  let i = 0;
  const interval = setInterval(() => {
    i++;
    heroGreetingText.textContent = text.slice(0, i);
    heroGreetingText.appendChild(cursor);
    if (i >= text.length) {
      clearInterval(interval);
      setTimeout(() => cursor.remove(), 1200);
    }
  }, 38);
}

function revealChat() {
  if (chatRevealed) return;
  chatRevealed = true;
  heroScreen.classList.add("hero-hidden");
  mainShell.classList.remove("pre-chat");
  addMessage("assistant", "Hello. Laguna is online. Ask for a briefing, schedule, reminder, focus plan, or anything you want help with.");
  
  // Also bring to front when revealed
  bringAppToFront();
}

heroForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = heroPromptInput.value;
  if (!value.trim()) return;
  revealChat();
  heroPromptInput.value = "";
  submitPrompt(value);
});

heroMicButton?.addEventListener("click", () => {
  if (recognition) recognition.start();
});

const localSkills = [
  {
    test: /brief|morning|daily|status/i,
    reply: () => {
      const now = new Date();
      return `Good ${partOfDay(now)}. Local systems are online. Today is ${now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric"
      })}. I can help you plan tasks, draft notes, brainstorm automations, and prepare reminders.`;
    }
  },
  {
    test: /schedule|calendar|plan/i,
    reply: () =>
      "Here is a crisp plan: choose one priority, block 45 minutes for focused work, take a 10 minute reset, then handle messages in a single batch. Tell me your tasks and I will turn them into a tighter schedule."
  },
  {
    test: /remind|reminder/i,
    reply: (text) => {
      const reminder = text.replace(/^(turn this into a reminder:|remind me to|create reminder)/i, "").trim();
      saveMemory({ type: "reminder", text: reminder || text, createdAt: new Date().toISOString() });
      return `Reminder captured: ${reminder || text}. For real notifications, the next upgrade is a tiny backend worker or browser notification permission.`;
    }
  },
  {
    test: /idea|automation|computer/i,
    reply: () =>
      "Five useful upgrades: voice-launch apps, summarize your clipboard, auto-sort downloads, create calendar events from plain text, and watch a folder for documents to rename and file."
  },
  {
    test: /focus/i,
    reply: () =>
      "Focus mode ready. Pick the mission, close noisy tabs, set a 25 minute timer, and define what 'done' looks like in one sentence. Give me the mission and I will sharpen it."
  },
  {
    test: /setup|api|openai|brain/i,
    reply: () =>
      "To add a real AI brain, create a small server endpoint such as /api/assistant that calls your model provider. Keep the API key on the server. Then replace callRealAssistant() in app.js with a fetch to that endpoint."
  }
];

function partOfDay(date) {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function updateClock() {
  clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addMessage(role, text, opts = {}) {
  const node = document.createElement("article");
  node.className = `message ${role}`;

  if (role === "assistant") {
    let displayText = cleanAssistantText(text);

    if (displayText.includes("<div style=") || displayText.includes("<svg")) {
      node.innerHTML = `<strong>Assistant:</strong> ${displayText}`;
      messages.append(node);
      const scripts = node.querySelectorAll("script");
      scripts.forEach((oldScript) => {
        const newScript = document.createElement("script");
        newScript.textContent = oldScript.textContent;
        document.body.appendChild(newScript).parentNode.removeChild(newScript);
      });
      messages.scrollTop = messages.scrollHeight;
      return node;
    } else if (displayText.includes("![") && displayText.includes("](")) {
      let escapedText = escapeHtml(displayText);
      const htmlText = escapedText.replace(
        /!\[([^\]]*)]\(([^)]*)\)/g,
        (match, alt, src) => `<br><img src="${src}" alt="${alt}" style="max-width: 100%; max-height: 350px; border-radius: 8px; margin-top: 12px; display: block; border: 1px solid rgba(255,255,255,0.1);" />`
      );
      node.innerHTML = `<strong>Assistant:</strong> ${htmlText}`;
      messages.append(node);
      messages.scrollTop = messages.scrollHeight;
      return node;
    } else if (opts.stream) {
      node.innerHTML = `<strong>Assistant:</strong> <span class="typed-text"></span><span class="typing-cursor"></span>`;
      messages.append(node);
      typeOutText(node.querySelector(".typed-text"), node.querySelector(".typing-cursor"), displayText);
      messages.scrollTop = messages.scrollHeight;
      return node;
    } else {
      node.innerHTML = `<strong>Assistant:</strong> ${escapeHtml(displayText)}`;
    }
  } else {
    node.innerHTML = escapeHtml(text);
  }

  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
  return node;
}

function typeOutText(targetSpan, cursorSpan, fullText) {
  let i = 0;
  const speed = 14;
  const chunk = 2;
  const safeText = escapeHtml(fullText);
  const interval = setInterval(() => {
    i += chunk;
    targetSpan.innerHTML = safeText.slice(0, i);
    messages.scrollTop = messages.scrollHeight;
    if (i >= safeText.length) {
      clearInterval(interval);
      if (cursorSpan) cursorSpan.remove();
    }
  }, speed);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;',
    "'": "&#039;"
  })[char]);
}

function saveMemory(item) {
  const existing = JSON.parse(localStorage.getItem("personal-ai-memory") || "[]");
  existing.push(item);
  localStorage.setItem("personal-ai-memory", JSON.stringify(existing.slice(-50)));
}

function readFileData(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    if (file.type.startsWith("image/")) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
    reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
  });
}

async function callRealAssistant(prompt, file) {
  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, file })
    });
    const data = await response.json();
    if (!response.ok) {
      return data.error ? `AI backend error: ${data.error}` : null;
    }
    return data.reply || null;
  } catch (err) {
    console.error("callRealAssistant fetch failed:", err);
    return null;
  }
}

async function answer(prompt, fileToSend = null) {
  setCoreState("processing");
  systemLine.textContent = "Processing instruction...";
  systemLine.classList.add("thinking");

  const realReply = await callRealAssistant(prompt, fileToSend);
  const skill = localSkills.find((entry) => entry.test.test(prompt));
  const reply = realReply || (skill ? skill.reply(prompt) : fallbackReply(prompt));

  addMessage("assistant", reply, { stream: true });
  speak(reply);

  systemLine.classList.remove("thinking");
  systemLine.textContent = "Systems online. Awaiting your instruction.";
  setCoreState("idle");
}

function fallbackReply(prompt) {
  return `I heard: "${prompt}". I am running in local mode, so I can handle built-in commands now. Add a backend AI endpoint to make me reason over anything you ask.`;
}

function cleanAssistantText(value) {
  return String(value)
    .replace(/<tool_call[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<\/?(?:tool_call|arg_key|arg_value)[^>]*>/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`{1,3}\s*tool_code[\s\S]*?`{1,3}/gi, "")
    .replace(/^\s*tool_code\b.*$/gim, "")
    .replace(/^\s*get_weather\b.*$/gim, "")
    .replace(/^\s*\*?\s*Source\s*:\s*.*$/gim, "")
    .replace(/^\s*\*?\s*Sources\s*:\s*.*$/gim, "")
    .replace(/\b(?:tool_call|tool_code|arg_key|arg_value)\b/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function pickVoice() {
  if (!synth) return null;
  const voices = synth.getVoices();
  if (!voices.length) return null;
  const preferredNames = ["Daniel", "Arthur", "Google UK English Male", "Microsoft Ryan", "Microsoft David"];
  for (const name of preferredNames) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }
  return voices.find((v) => v.lang.startsWith("en") && /male/i.test(v.name)) || voices.find((v) => v.lang.startsWith("en")) || voices[0];
}

if (synth) {
  synth.onvoiceschanged = () => {
    preferredVoice = pickVoice();
  };
  preferredVoice = pickVoice();
}

function speak(text) {
  if (!synth) return;
  synth.cancel();
  const spokenText = cleanSpokenText(text);
  if (!spokenText) return;
  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.rate = 0.96;
  utterance.pitch = 0.82;
  if (preferredVoice) utterance.voice = preferredVoice;

  utterance.onstart = () => {
    setCoreState("speaking");
    voiceState.textContent = "Speaking";
    setWaveformActive(true);
  };
  utterance.onend = () => {
    setCoreState("idle");
    voiceState.textContent = "Idle";
    setWaveformActive(false);
  };
  utterance.onerror = () => {
    setCoreState("idle");
    voiceState.textContent = "Idle";
    setWaveformActive(false);
  };

  synth.speak(utterance);
}

function cleanSpokenText(value) {
  return cleanAssistantText(value)
    .replace(/[#*_~`^|\\/{}[\]<>()]+/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[^\p{L}\p{N}\s.,?!:'"-]/gu, " ")
    .replace(/\s*([.,?!])\s*/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function submitPrompt(prompt) {
  const trimmed = prompt.trim();
  if (!trimmed && !attachedFile) return;

  revealChat();

  let filePayload = null;
  if (attachedFile) {
    filePayload = await readFileData(attachedFile);
    addMessage("user", `[Attached: ${attachedFile.name}] ${trimmed}`);
  } else {
    addMessage("user", trimmed);
  }

  input.value = "";
  input.placeholder = "Ask for a briefing, reminder, plan, or command...";
  attachButton.style.background = "";

  const fileToSend = filePayload;
  attachedFile = null;
  fileInput.value = "";

  answer(trimmed, fileToSend);
}

attachButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    attachedFile = fileInput.files[0];
    attachButton.style.background = "#4173ff";
    input.placeholder = `Attached: ${attachedFile.name} (Type description to send)`;
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPrompt(input.value);
});

quickPrompts.forEach((button) => {
  button.addEventListener("click", () => submitPrompt(button.dataset.prompt));
});

tools.forEach((button) => {
  button.addEventListener("click", () => {
    tools.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    submitPrompt(button.dataset.command);
  });
});

micButton.addEventListener("click", () => {
  if (recognition) recognition.start();
});

function setupVoice() {
  if (!SpeechRecognition) {
    micButton.disabled = true;
    micButton.title = "Voice recognition is unavailable in this browser";
    voiceState.textContent = "N/A";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";
  recognition.onstart = () => {
    voiceState.textContent = "Listening";
    systemLine.textContent = "Listening for voice command...";
    setCoreState("listening");
    setWaveformActive(true);
    micButton.classList.add("listening");
  };
  recognition.onend = () => {
    voiceState.textContent = "Idle";
    systemLine.textContent = "Systems online. Awaiting your instruction.";
    setCoreState("idle");
    setWaveformActive(false);
    micButton.classList.remove("listening");
  };
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    submitPrompt(transcript);
  };
}

updateClock();
setInterval(updateClock, 15000);
setupVoice();
setCoreState("idle");

fetch("/api/health")
  .then((response) => response.json())
  .then((health) => {
    mode.textContent = health.aiConfigured ? shortModelName(health.model) : "Local";
  })
  .catch(() => {
    mode.textContent = "Local";
  });

typeGreeting(GREETING);
setCoreState("idle");
setTimeout(() => speak(GREETING), 300);

function shortModelName(model) {
  if (!model) return "AI";
  return model.includes("/") ? model.split("/").pop().replace(":free", "") : model;
}

document.addEventListener('click', () => {
  if (!clapDetectionActive) {
    initClapDetection();
  }
}, { once: true });

setTimeout(() => {
  if (!clapDetectionActive) {
    initClapDetection().catch(() => {
      console.log('Waiting for user interaction to start clap detection');
    });
  }
}, 3000);

console.log('👏 Clap detection loaded! Clap twice to wake up the assistant.');
console.log('💡 Make sure the app is open in your browser for claps to work.');
console.log('🔄 Clap detection keeps running even if you switch tabs!');