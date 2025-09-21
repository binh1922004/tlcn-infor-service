import response from "../helpers/response.js";
import {uploadFile} from "../method/s3.method.js";
import problemModels from "../models/problem.models.js";
import {CustomZipProcessor} from "../method/zip.method.js";

const IMAGE_PROBLEM_DIR = (problemId, imgKey) => `problems/${problemId}/images/${imgKey}`;
const TESTCASE_PROBLEM_DIR = (problemId, testcaseKey) => `problems/${problemId}/testcase/${testcaseKey}`;
const ZIP_PROBLEM_DIR = (problemId, zipKey) => `problems/${problemId}/${zipKey}`;
const S3_PROBLEM_PREFIX = (problemId) => `problems/${problemId}`;

export const uploadProblemImage = async (req, res) => {
    try{
        const data = await uploadFile(IMAGE_PROBLEM_DIR('a123', req.file.originalname), req.file.buffer, req.file.mimetype);
        return response.sendSuccess(res, data);
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}

export const uploadProblemTestcases = async (req, res) => {
    const problemId = req.params.id;
    const customZipProcessor = new CustomZipProcessor();
    const problem = await problemModels.findById(problemId);
    if (problem == null) {
        return response.sendError(res, "Problem not found", 404);
    }
    try{
        //unzip file and upload to s3
        const data = await customZipProcessor.processZipFromBuffer(req.file.buffer,
            req.file.originalname,
            S3_PROBLEM_PREFIX(problemId),
            problemId);
        //update problem status and noOfTestcases
        problem.numberOfTestCases = data.summary.totalFolders;
        problem.isActive = true;
        await problemModels.updateOne({ _id: problemId }, problem);
        return response.sendSuccess(res, data, 'success');
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}

export const createProblem = async (req, res) => {
    try{
        const problem = req.body;
        const createdProblem = await problemModels.create(problem);
        return response.sendSuccess(res, createdProblem);
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}


export const getProblemById = async (req, res) => {
    try{
        const id = req.params.id;
        const problem = await problemModels.findById(id);
        return response.sendSuccess(res, problem);
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}