import mongoose from 'mongoose';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
import ProblemModels from "../models/problem.models.js";
import {config} from "../../config/env.js";

export default async function addShortId() {
    await mongoose.connect(config.mongodbUri);
    console.log('Starting migration to add shortId to problems...');
    const problemWithoutShortId = await ProblemModels.find({ shortId: { $exists: false } });

    console.log(`Found ${problemWithoutShortId.length} problem without shortId.`);

    for (const problem of problemWithoutShortId) {
        problemWithoutShortId.shortId = nanoid();
        await problem.save();
    }

    console.log("Migration completed!");
    await mongoose.disconnect();
}
