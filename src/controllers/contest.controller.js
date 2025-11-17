import response from "../helpers/response.js";
import contestModel from "../models/contest.model.js";
import problemModels from "../models/problem.models.js";
import {mapToContestDto, pageDTO} from "../helpers/dto.helpers.js";
import bcrypt from "bcrypt";
import contestParticipantModel from "../models/contestParticipant.model.js";
import {contestIsRunning, getUserParticipantStatus} from "../service/contest.service.js";
import mongoose from "mongoose";

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
            filter.$or = [
                { code: { $regex: name, $options: 'i' } },
                { title: { $regex: name, $options: 'i' } }
            ];
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
        const {contestId} = req.params;
        const {addProblems} = req.body;
        const contest = await contestModel.findById(contestId);
        if (!contest) {
            return response.sendError(res, 'Contest not found', 404);
        }
        const problems = [];
        for (const addProblem of addProblems) {
            const problem = await problemModels.findById(addProblem.problemId);
            if (!problem) {
                return response.sendError(res, 'One or more problems not found', 404);
            }
            const order = addProblem.order - 1;
            const point = addProblem.point;
            problems.push({problemId: addProblem.problemId, order: order, point: point});
        }
        contest.problems = problems;
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
        const userId = req.user?._id;
        console.log('userId: ', userId);
        const contests = await contestModel.aggregate([
            {
                $match: { isActive: true }  // ✅ ĐÚNG: Filter trước
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $skip: skip
            },
            {
                $limit: pageSize
            },
            {
                $lookup: {
                    from: "contestparticipants",
                    let: { contestId: "$_id", userId: new mongoose.Types.ObjectId(userId) },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$contestId", "$$contestId"] },
                                        { $eq: ["$userId", "$$userId"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "userRegistered"
                }
            },
            {
                $addFields: {
                    isRegistered: { $gt: [{ $size: "$userRegistered" }, 0] }
                }
            },
            {
                $project: {
                    userRegistered: 0
                }
            }
        ]);
        const totalContests = await contestModel.countDocuments({isActive: true});
        return response.sendSuccess(res, pageDTO(contests.map(m => mapToContestDto(m), pageNumber, pageSize), totalContests, pageNumber, pageSize));
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

export const codeChecking = async (req, res, next) => {
    try {
        const {code} = req.body;
        const contest = await contestModel.findOne({code: code});
        if (!contest) {
            return response.sendSuccess(res, "ok", "ok")
        }
        return response.sendError(res, "Code is already taken", 400);
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}


export const getContestById = async (req, res, next) => {
    try {
        const contestId = req.params.id;
        const contest = await contestModel.findById(contestId).populate({
            path: 'problems.problemId',
            select: 'name difficulty shortId' // chọn các field muốn lấy
        })
        if (!contest) {
            return response.sendError(res, 'Contest not found', 404);
        }
        if (contest.isPrivate && req.user?.role !== 'admin') {
            return response.sendError(res, 'Access denied. This contest is private.', 403);
        }
        console.log(contest);
        return response.sendSuccess(res, mapToContestDto(contest));
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const getContestByCode = async (req, res, next) => {
    try {
        const code = req.params.code;
        const contest = await contestModel.findOne({code: code}).populate({
            path: 'problems.problemId',
            select: 'name difficulty shortId' // chọn các field muốn lấy
        })
        if (!contest) {
            return response.sendError(res, 'Contest not found', 404);
        }
        if (contest.isPrivate && req.user?.role !== 'admin') {
            return response.sendError(res, 'Access denied. This contest is private.', 403);
        }

        let data = mapToContestDto(contest.toObject());
        data.userParticipation = await getUserParticipantStatus(contest, req.user?._id);
        return response.sendSuccess(res, data);
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const registerToContest = async (req, res, next) => {
    try {
        const contestId = req.params.id;
        const userId = req.user._id;
        const body = req.body;

        const contest = await contestModel.findById(contestId);
        if (!contest) {
            return response.sendError(res, 'Contest not found', 404);
        }

        if (contest.classRoom !== null){
            return response.sendError(res, 'Contest is linked to a class, please join the class to access the contest', 403);
        }
        if (contest.isPrivate) {
            const passwordMatch = await bcrypt.compare(body.password || '', contest.password || '');
            if (!passwordMatch) {
                return response.sendError(res, 'Incorrect password for private contest', 403);
            }
        }
        else{
            const isRegistered = await contestParticipantModel.exists({contestId: contest._id, userId: userId});
            if (isRegistered) {
                return response.sendError(res, 'User already registered to this contest', 400);
            }
        }
        const contestParticipant = {
            contestId: contest._id,
            userId: userId,
            registeredAt: new Date(),
            mode: "official",
            startTime: contest.startTime,
            endTime: contest.endTime,
        }
        await contestParticipantModel.create(contestParticipant);
        return response.sendSuccess(res, 'Registered to contest successfully');
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}