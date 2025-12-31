import app from "./app.js";
import { config } from "../config/env.js";
import connectDB from "../config/db.js";
import addShortId from "./migration/addShortId.js";
import {setupKafkaConsumers} from "./service/kafka.service.js";
import {setupSocket} from "./socket/socket.js";
import startClassroomAutoCloseJob from "./jobs/classroom.job.js";
const migrateProblems = async () => {
  await addShortId();
}

const startServer = async () => {
  await connectDB();

  if (!process.env.CI){
    setupSocket();
    // await setupKafkaConsumers();

    if (config.enable_cron_jobs !== 'false') {
      console.log(' Starting scheduled jobs...');
      startClassroomAutoCloseJob();
    } else {
      console.log(' Cron jobs are disabled');
    }
  }
  else{
    console.log(' CI environment detected, skipping DB connection and Kafka setup.');
  }

  app.listen(config.port || 8080, () => {
    console.log(`Server running on port ${config.port}`);
  });
};
startServer();
