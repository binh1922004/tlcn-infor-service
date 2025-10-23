import response from "../helpers/response.js";
import SubmissionModel from "../models/submission.model.js";
import {pageDTO} from "../helpers/dto.helpers.js";
import {sendMessage} from "../service/kafka.service.js";

export const submitProblem = async (req, res) => {
    try{
        const id = req.user._id;
        const body = req.body;
        body.problem = req.params.id;
        body.user = id;
        let submission = await await SubmissionModel.create(body);
        submission = await submission.populate('problem', 'numberOfTestCases time memory');
        // body.
        await sendMessage('submission-topic', submission);
        return response.sendSuccess(res, submission);
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}

export const getSubmissionsByUserId = async (req, res) => {
    try{
        const userId = req.params.id;
        const {limit = 10, page = 1, language, problemId} = req.query;
        const skip = (page - 1) * limit;
        const filter = {
            user: userId,
        }
        if (problemId){
            filter.problem = problemId;
        }
        if (language !== 'all' && language){
            filter.language = language
        }
        const submissions = await SubmissionModel.find(filter)
            .sort({createdAt: -1})
            .skip(skip)
            .limit(limit)

        const total = await SubmissionModel.countDocuments(filter);
        return response.sendSuccess(res, pageDTO(submissions, total, page, limit));
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}


export const getSubmission = async (req, res) => {
    try{
        const {userId, problemId} = req.query;
        const {limit = 10, page = 1, language} = req.query;
        const skip = (page - 1) * limit;

        let filter = {};

        if (userId){
            filter.user = userId;
        }

        if (problemId){
            filter.problem = problemId;
        }

        if (language !== 'all' && language){
            filter.language = language
        }

        const submissions = await SubmissionModel.find(filter)
            .sort({createdAt: -1})
            .skip(skip)
            .limit(limit)

        const total = await SubmissionModel.countDocuments(filter);
        console.log(total)
        return response.sendSuccess(res, pageDTO(submissions, total, page, limit));
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}