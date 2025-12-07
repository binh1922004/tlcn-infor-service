import response from "../helpers/response.js";
import contestModel from "../models/contest.model.js";
import problemModels from "../models/problem.models.js";
import {mapToContestDto, pageDTO} from "../helpers/dto.helpers.js";
import bcrypt from "bcrypt";
import contestParticipantModel from "../models/contestParticipant.model.js";
import {contestIsRunning, getRankingForContest, getUserParticipantStatus} from "../service/contest.service.js";
import mongoose from "mongoose";
import {createContestBroadcast, createContestAnnouncementNotification} from "../service/notification.service.js";
import {broadcastNewContest, sendMessageToContestRoom} from "../socket/socket.js";
import SubmissionModel from "../models/submission.model.js";
import {Status} from "../utils/statusType.js";
const SALT_ROUNDS = 10

export const create = async  (req, res, next) => {
    try {
        const user = req.user;
        let contest = req.body
        contest.createdBy = user._id;
        contest.isActive = false;
        if (contest.isPrivate && contest.password){
            contest.password = bcrypt.hashSync(contest.password, SALT_ROUNDS);
        }
        else{
            contest.password = null;
        }
        const now = new Date();
        if (new Date(contest.startTime) < now){
            return response.sendError(res, 'Start time must be in the future', 400);
        }

        if (new Date(contest.endTime) <= new Date(contest.startTime)){
            return response.sendError(res, 'End time must be after start time', 400);
        }
        const createdContest = await contestModel.create(contest);
        //  Tạo thông báo cho tất cả users nếu contest được active
        if (user?.role === 'admin' && createdContest.isActive) {
            try {
                await createContestCreatedNotification(
                    createdContest._id,
                    {
                        title: createdContest.title,
                        description: createdContest.description,
                        startTime: createdContest.startTime,
                        endTime: createdContest.endTime,
                        duration: createdContest.duration,
                        code: createdContest.code,
                        isPrivate: createdContest.isPrivate
                    },
                    {
                        _id: user._id,
                        userName: user.userName,
                        fullName: user.fullName,
                        avatar: user.avatar
                    }
                );

                //  Broadcast qua socket
                const notificationData = {
                    contestId: createdContest._id,
                    contestCode: createdContest.code,
                    title: createdContest.title,
                    message: `${user.fullName || user.userName} đã tạo kỳ thi: "${createdContest.title}"`,
                    author: {
                        _id: user._id,
                        userName: user.userName,
                        fullName: user.fullName,
                        avatar: user.avatar
                    },
                    preview: {
                        description: createdContest.description?.substring(0, 150) + '...',
                        startTime: createdContest.startTime,
                        endTime: createdContest.endTime
                    },
                    createdAt: createdContest.createdAt,
                    actionUrl: `/contest/${createdContest.code}`
                };

                broadcastNewContest(notificationData, user._id);
                
                console.log(`✅ Contest notification broadcast for contest ${createdContest._id}`);
            } catch (notificationError) {
                console.error('❌ Error sending contest notification:', notificationError);
            }
        }
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
        const {page, size, status, type} = req.query;
        const pageNumber = parseInt(page) || 1;
        const pageSize = parseInt(size) || 20;
        const skip = (pageNumber - 1) * pageSize;
        const userId = req.user?._id;
        console.log('userId: ', userId);
        const match = {};
        match.isActive = true;

        const now = new Date();
        console.log('Status: ', status);
        if (status) {
            const arr = status.split(',');
            const or = [];

            if (arr.includes('upcoming')) {
                or.push({ startTime: { $gt: now } });
            }

            if (arr.includes('ongoing')) {
                or.push({
                    startTime: { $lte: now },
                    endTime: { $gte: now }
                });
            }

            if (arr.includes('ended')) {
                or.push({ endTime: { $lt: now } });
            }

            match.$or = or;
        }
        if (type) {
            if (type === 'public') {
                match.isPrivate = false;
            }
            else if (type === 'private') {
                match.isPrivate = true;
            }
        }
        const contests = await contestModel.aggregate([
            {
                $match: match
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
        if (contestUpdates.isPrivate && contestUpdates.password){
            contestUpdates.password = bcrypt.hashSync(contestUpdates.password, SALT_ROUNDS);
        }
        else{
            contestUpdates.password = null;
        }
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
        const user = req.user;
        
        console.log(`🔄 Toggle contest status - ID: ${contestId}, User: ${user.userName}`);
        
        const contest = await contestModel.findById(contestId);
        if (!contest) {
            return response.sendError(res, 'Contest not found', 404);
        }
        
        const wasInactive = !contest.isActive;
        contest.isActive = !contest.isActive;
        await contest.save();
        
        console.log(`✅ Contest status changed - isActive: ${contest.isActive}`);
        
        // ✅ Nếu contest vừa được active, gửi thông báo
        if (wasInactive && contest.isActive && user?.role === 'admin') {
            try {
                // Tạo broadcast notification
                const broadcast = await createContestBroadcast(
                    contest._id,
                    {
                        title: contest.title,
                        description: contest.description,
                        startTime: contest.startTime,
                        endTime: contest.endTime,
                        duration: contest.duration,
                        code: contest.code,
                        isPrivate: contest.isPrivate
                    },
                    {
                        _id: user._id,
                        userName: user.userName,
                        fullName: user.fullName,
                        avatar: user.avatar
                    }
                );
                
                // Gửi realtime qua socket
                broadcastNewContest(broadcast);
                
                console.log(`✅ Broadcast created and sent for contest ${contest._id}`);
            } catch (notificationError) {
                console.error('❌ Error sending contest notification:', notificationError);
            }
        }
        
        return response.sendSuccess(res, contest);
    }
    catch (error) {
        console.log('❌ Error in toggleContestStatus:', error)
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
        await contestModel.updateOne({ _id: contest._id }, { $inc: { noOfParticipants: 1 } });
        return response.sendSuccess(res, 'Registered to contest successfully');
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const getContestRanking = async (req, res, next) => {
    try {
        const contestId = req.params.id;
        const {page, size, mode} = req.query;
        const pageNumber = parseInt(page) || 1;
        const pageSize = parseInt(size) || 20;
        const skip = (pageNumber - 1) * pageSize;
        const data = await getRankingForContest(contestId, mode, {skip: skip, limit: pageSize});
        return response.sendSuccess(res, data);
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const createContestNotification = async (req, res, next) => {
    try {
        const contestId = req.params.id;
        const {message} = req.body;
        const contest = await contestModel.findById(contestId);
        if (!contest) {
            return response.sendError(res, 'Contest not found', 404);
        }

        const notification = createContestNotification(contestId, message);
        sendMessageToContestRoom(contestId, 'contest-notification', notification);
        return response.sendSuccess(res, notification);
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}
export const createContestAnnouncement = async (req, res, next) => {
    try {
        const contestId = req.params.id;
        const {message} = req.body;
        const user = req.user;
        
        const contest = await contestModel.findById(contestId);
        if (!contest) {
            return response.sendError(res, 'Contest not found', 404);
        }

        // Tạo notification cho participants
        const notification = await createContestAnnouncementNotification(
            contestId,
            message,
            {
                _id: user._id,
                userName: user.userName,
                fullName: user.fullName,
                avatar: user.avatar
            }
        );
        
        // Broadcast qua socket cho room contest
        sendMessageToContestRoom(contestId, 'contest-announcement', {
            contestId,
            message,
            author: {
                _id: user._id,
                userName: user.userName,
                fullName: user.fullName
            },
            createdAt: new Date()
        });
        
        return response.sendSuccess(res, notification);
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const getContestStatistics = async (req, res, next) => {
    try {
        const totalContests = await contestModel.countDocuments();
        const onGoingContests = await contestModel.countDocuments({
            startTime: { $lte: new Date() },
            endTime: { $gte: new Date() }
        });
        const upcomingContests = await contestModel.countDocuments({
            startTime: { $gt: new Date() }
        });
        const pastContests = await contestModel.countDocuments({
            endTime: { $lt: new Date() }
        });
        return response.sendSuccess(res, {
            totalContests,
            onGoingContests,
            upcomingContests,
            pastContests
        });
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}

export const getUpcomingContests = async (req, res, next) => {
    try {
        const now = new Date();
        const contests = await contestModel.find({startTime: {$gt: now}, isActive: true})
            .sort({startTime: 1})
            .limit(2);
        return response.sendSuccess(res, contests.map(m => mapToContestDto(m)));
    }
    catch (error) {
        console.log(error)
        return response.sendError(res, error);
    }
}