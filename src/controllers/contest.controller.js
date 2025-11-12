import response from "../helpers/response.js";
import contestModel from "../models/contest.model.js";
import problemModels from "../models/problem.models.js";
import {mapToContestDto, pageDTO} from "../helpers/dto.helpers.js";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10

export const create = async  (req, res, next) => {
    try {
        const user = req.user;
        let contest = req.body
        contest.createdBy = user._id;
        contest.isPrivate = true;
        contest.isActive = false;
        if (contest.password){
            contest.password = bcrypt.hashSync(contest.password, SALT_ROUNDS);
        }
        const now = new Date();
        if (new Date(contest.startTime) < now){
            return response.sendError(res, 'Start time must be in the future', 400);
        }

        if (new Date(contest.endTime) <= new Date(contest.startTime)){
            return response.sendError(res, 'End time must be after start time', 400);
        }
        const createdContest = await contestModel.create(contest);
        return response.sendSuccess(res, mapToContestDto(createdContest));
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const getAll = async  (req, res, next) => {
    try {
        let {name, page, size, sortBy, order} = req.query;
        let filter = {};
        if (name) {
            filter.title = { $regex: name, $options: 'i' }; // Case-insensitive regex search
        }

        if (!sortBy) {
            sortBy = 'createdAt';
        }

        if (!order) {
            order = 1;
        }
        else{
            order = order.toLowerCase() === 'asc' ? 1 : -1;
        }

        const pageNumber = parseInt(page) || 1;
        const pageSize = parseInt(size) || 20;
        const skip = (pageNumber - 1) * pageSize;

        const contests = await contestModel.find(filter)
            .skip(skip)
            .limit(pageSize)
            .sort({[sortBy]: order})
        const totalContests = await contestModel.countDocuments(filter);
        return response.sendSuccess(res, pageDTO(contests.map(m => mapToContestDto(m)), totalContests, pageNumber, pageSize));
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const addProblemsToContest = async (req, res, next) => {
    try {
        const {contestId, problemId} = req.params;
        console.log(contestId, problemId)
        const contest = await contestModel.findById(contestId);
        if (!contest) {
            return response.sendError(res, 'Contest not found', 404);
        }
        const problem = await problemModels.findById(problemId);
        if (!problem) {
            return response.sendError(res, 'One or more problems not found', 404);
        }
        const order = contest.problems.length;
        contest.problems.push({problemId: problemId, order: order});
        await contest.save();
        return response.sendSuccess(res, contest);
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}
export const getAllPublicContests = async (req, res, next) => {
    try {
        const {page, size} = req.query;
        const pageNumber = parseInt(page) || 1;
        const pageSize = parseInt(size) || 20;
        const skip = (pageNumber - 1) * pageSize;

        const contests = await contestModel.find({isPrivate: false, isActive: true})
            .skip(skip)
            .limit(limitNumber);
        const totalContests = await contestModel.countDocuments();

        return response.sendSuccess(res, pageDTO(contests, totalContests.map(m => mapToContestDto(m)), pageNumber, pageSize));
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const updateContest = async (req, res, next) => {
    try {
        const contestId = req.params.id;
        const contestUpdates = req.body;
        const contest = await contestModel.findById(contestId);
        if (contest == null) {
            return response.sendError(res, "Contest not found", 404);
        }
        if (contestUpdates.problems) {
            return response.sendError(res, "Use the addProblemsToContest endpoint to update problems", 400);
        }
        Object.assign(contest, contestUpdates);
        await contestModel.updateOne({ _id: contestId }, contest);
        return response.sendSuccess(res, contest);
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const deleteContest = async (req, res, next) => {
    try {
        const contestId = req.params.id;
        await contestModel.updateOne({ _id: contestId }, { isPrivate: true, isActive: false });
        return response.sendSuccess(res, 'Contest deleted successfully');
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const toggleContestStatus = async (req, res, next) => {
    try {
        const contestId = req.params.id;
        const contest = await contestModel.findById(contestId);
        if (!contest) {
            return response.sendError(res, 'Contest not found', 404);
        }
        contest.isActive = !contest.isActive;
        await contest.save();
        return response.sendSuccess(res, contest);
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}