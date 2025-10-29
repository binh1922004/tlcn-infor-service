import app from "./app.js";
import { config } from "../config/env.js";
import connectDB from "../config/db.js";
import addShortId from "./migration/addShortId.js";
import {setupKafkaConsumers} from "./service/kafka.service.js";
import {setupSocket} from "./socket/socket.js";

const migrateProblems = async () => {
  await addShortId();
}

const startServer = async () => {
  await connectDB();

  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
  setupSocket();
  await setupKafkaConsumers();
};
await migrateProblems()
startServer();
