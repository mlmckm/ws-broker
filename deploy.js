#!/usr/bin/env node

const { execSync } = require("node:child_process");

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

async function main() {
  const commitMessage = getArg("message", "chore: deploy");
  const remote = getArg("remote", "origin");
  const force = getArg("force", "false");

  // Coolify — LONCA MYENSIM sunucusundaki ws-broker uygulaması
  const coolifyUrl   = "https://paas.ensimlive.com";
  const coolifyUuid  = "fcsgo4gggkcsocwscs0ogok4";   // ws-broker app UUID
  const coolifyToken = "COOLIFY_TOKEN_FROM_ENV_DEPLOY";

  console.log("-> Git değişiklikleri hazırlanıyor...");
  runInherit("git add -A");

  const hasStaged = run("git diff --cached --name-only");
  if (hasStaged) {
    console.log("-> Commit atılıyor...");
    runInherit(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
  } else {
    console.log("-> Commitlenecek yeni değişiklik yok, mevcut commitler push edilecek.");
  }

  console.log("-> GitHub'a push ediliyor...");
  runInherit(`git push ${remote} HEAD`);

  const endpoint = `${coolifyUrl.replace(/\/$/, "")}/api/v1/applications/${coolifyUuid}/start`;

  console.log("-> Coolify deploy tetikleniyor...");
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${coolifyToken}`,
    },
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Coolify deploy başarısız (${response.status}): ${bodyText}`);
  }

  const data = JSON.parse(bodyText);
  console.log("-> Deploy tetiklendi!");
  console.log(`   Deployment UUID: ${data.deployment_uuid}`);
  console.log(`   Coolify Panel: ${coolifyUrl}`);
  console.log(`   Dashboard: http://fcsgo4gggkcsocwscs0ogok4.10.20.5.252.sslip.io`);
}

main().catch(err => {
  console.error("Deploy script hatası:", err.message);
  process.exit(1);
});
