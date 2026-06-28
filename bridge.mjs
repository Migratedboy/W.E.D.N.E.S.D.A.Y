import { createServer } from "node:http";
import { exec } from "node:child_process";

const PORT = 4174; // Runs safely on a separate port

createServer(async (req, res) => {
  // Allow your AI page to talk to this bridge safely
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const { command } = JSON.parse(body);
        const lowerCmd = String(command || "").toLowerCase();

        if (lowerCmd.includes("open notepad")) {
          exec("notepad.exe");
          res.end(JSON.stringify({ success: true, reply: "Opened Notepad!" }));
          return;
        }
        if (lowerCmd.includes("open chrome")) {
          exec("start chrome");
          res.end(JSON.stringify({ success: true, reply: "Opened Chrome!" }));
          return;
        }
        if (lowerCmd.includes("volume up")) {
          exec(`powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"`);
          res.end(JSON.stringify({ success: true, reply: "Volume turned up!" }));
          return;
        }
        
        res.end(JSON.stringify({ success: false }));
      } catch (e) {
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    res.end("Bridge Online");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Automation bridge running on port ${PORT}`);
});