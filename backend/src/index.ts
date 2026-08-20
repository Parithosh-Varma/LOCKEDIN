import "dotenv/config";
import express from "express";
import cors from "cors";
import { logger, sanitizeSecrets } from "./lib/logger.js";
import { healthCheck } from "./db/client.js";
import { api } from "./api/routes.js";
import { telegram } from "./bot/telegram.js";
import { reminderScheduler } from "./services/reminders.js";
import { ensureUser } from "./lib/auth.js";

const PORT = Number(process.env.PORT || 8787);
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// sanitize error logging so secrets never hit logs
app.use((req, res, next) => {
  const orig = res.json.bind(res);
  res.json = (body: unknown) => orig(body);
  next();
});

app.use("/api", api);
app.get("/", (_req, res) => res.json({ app: "LOCKEDIN", ok: true }));

async function boot() {
  const dbOk = await healthCheck();
  if (!dbOk) {
    logger.error("Database unreachable — retrying in 10s");
    setTimeout(boot, 10_000);
    return;
  }
  logger.info("Database connected");

  await ensureUser();
  reminderScheduler.start();
  await telegram.start();

  app.listen(PORT, () => {
    logger.info(`LOCKEDIN backend listening on :${PORT}`);
    logger.info(`AI coach: ${process.env.AI_PROVIDER || "deterministic"}`);
    logger.info(`Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? "enabled" : "disabled (set TELEGRAM_BOT_TOKEN)"}`);
  });
}

process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection:", sanitizeSecrets(reason instanceof Error ? reason.message : String(reason)));
});
process.on("uncaughtException", (e) => {
  logger.error("uncaughtException:", sanitizeSecrets(e.message));
});

boot();