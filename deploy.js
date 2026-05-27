#!/usr/bin/env node
/**
 * WS Broker — Coolify Deploy Script
 * 
 * Kullanım:
 *   node deploy.js
 *   node deploy.js --message="feat: yeni özellik"
 * 
 * Gerekli env değişkenleri (.env.deploy dosyasında):
 *   COOLIFY_URL, COOLIFY_TOKEN, COOLIFY_APP_UUID
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function run(command) {
  return execSync(command, { stdio: "pipe", encoding: "utf8" }).trim();
}
function runInherit(command) {
  execSync(command, { stdio: "inherit" });
}
function getArg(name, fallback = "") {
  const raw = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  return raw.slice(name.length + 3);
}

// Load .env.deploy
function loadEnvFile() {
  const envPath = path.join(__dirname, ".env.deploy");
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.deploy dosyası bulunamadı.");
    console.error("   cp .env.deploy.example .env.deploy  →  sonra doldurun");
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvFile();

  const coolifyUrl  = process.env.COOLIFY_URL;
  const coolifyToken = process.env.COOLIFY_TOKEN;
  const appUuid     = process.env.COOLIFY_APP_UUID;
  const remote      = getArg("remote", "origin");
  const commitMessage = getArg("message", "chore: deploy");
  const force       = getArg("force", "false");

  if (!coolifyUrl || !coolifyToken || !appUuid) {
    console.error("❌ .env.deploy içinde COOLIFY_URL, COOLIFY_TOKEN ve COOLIFY_APP_UUID gerekli");
    process.exit(1);
  }

  console.log("→ Git değişiklikleri hazırlanıyor...");
  runInherit("git add -A");

  const hasStaged = run("git diff --cached --name-only");
  if (hasStaged) {
    console.log("→ Commit atılıyor...");
    runInherit(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
  } else {
    console.log("→ Yeni değişiklik yok, mevcut commitler push edilecek.");
  }

  console.log("→ GitHub'a push ediliyor...");
  runInherit(`git push ${remote} HEAD`);

  console.log("→ Coolify deploy tetikleniyor...");
  const endpoint = `${coolifyUrl.replace(/\/$/, "")}/api/v1/applications/${appUuid}/start`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${coolifyToken}` },
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Coolify deploy başarısız (${response.status}): ${bodyText}`);
  }

  const data = JSON.parse(bodyText);
  console.log("✅ Deploy tetiklendi!");
  console.log(`   Deployment UUID : ${data.deployment_uuid}`);
  console.log(`   Coolify Panel   : ${coolifyUrl}`);
}

main().catch(err => {
  console.error("Deploy script hatası:", err.message);
  process.exit(1);
});
