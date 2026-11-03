import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

process.on("message", async message => {
  if (message.type === "exit") {
    process.disconnect();
    return;
  }
  try {
    const journal = { transactionId: randomUUID(), ownerPid: process.pid,
      createdAt: new Date().toISOString(), originals: message.originals };
    await writeFile(message.journalPath, JSON.stringify(journal));
    process.send({ type: "ready", ownerPid: process.pid });
  } catch (error) {
    process.send({ type: "error", message: String(error) });
    process.disconnect();
  }
});
