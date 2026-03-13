import { config } from "./config.js";
import { startReminderScheduler } from "./scheduler/reminderScheduler.js";
import { createServer } from "./server/createServer.js";
import { WhatsAppConnectionManager } from "./whatsapp/WhatsAppConnectionManager.js";

async function bootstrap() {
  const manager = new WhatsAppConnectionManager();
  await manager.bootstrap();

  const app = createServer(manager);
  const server = app.listen(config.port, () => {
    console.log(`[whatsapp] servico ouvindo na porta ${config.port}`);
  });
  const scheduler = startReminderScheduler(manager);

  const shutdown = async () => {
    scheduler.stop();
    server.close();
    await manager.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

bootstrap().catch((error) => {
  console.error("[whatsapp] falha ao iniciar servico:", error);
  process.exit(1);
});
