import { createServer } from "node:http";
import { exec } from "node:child_process";

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = new URL(req.url, "http://localhost");
  
  if (url.pathname === "/notepad") exec("notepad.exe");
  if (url.pathname === "/chrome") exec("start chrome");
  if (url.pathname === "/volumeup") exec(`powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"`);
  
  res.end("Executed");
}).listen(4175, "127.0.0.1");