import response from "../helpers/response.js";
import {uploadFile} from "../method/s3.method.js";
import problemModels from "../models/problem.models.js";
const IMAGE_PROBLEM_DIR = (problemId, imgKey) => `problems/${problemId}/images/${imgKey}`;
const TESTCASE_PROBLEM_DIR = (problemId, testcaseKey) => `problems/${problemId}/testcase/${testcaseKey}`;

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
    try{
        const params = {
            Bucket: bucketName,
            Key: "testcases/" + req.file.originalname,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        }
        console.log(params)

        const command = new PutObjectCommand(params);
        const data = await s3.send(command);
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