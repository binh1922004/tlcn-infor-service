import response from "../helpers/response.js";
import SubmissionModel from "../models/submission.model.js";
import { pageDTO } from "../helpers/dto.helpers.js";
import { sendMessage } from "../service/kafka.service.js";
import mongoose from "mongoose";
import contestParticipantModel from "../models/contestParticipant.model.js";
import { getLatestContestParticipant } from "../service/contest.service.js";
import problemModels from "../models/problem.models.js";
import {populate} from "dotenv";
import {Status} from "../utils/statusType.js";
export const submitProblem = async (req, res) => {
  try {
    const id = req.user._id;
    let body = req.body;
    body.source = body.source.trim();
    body.problem = req.params.id;
    body.user = id;
    const problem = await problemModels
      .findById(req.params.id)
      .select("classroom");

    if (!problem) {
      return response.sendError(res, "Problem not found", 404);
    }
    if (body.classroom) {
      // User explicitly submit trong classroom (ví dụ: contest trong classroom)
      body.classroom = body.classroom;
    } else if (problem.classroom) {
      // Problem thuộc classroom, tự động gán
      body.classroom = problem.classroom;
    } else {
      body.classroom = null;
    }
    if (body.contest) {
      const latestParticipation = await getLatestContestParticipant(
        body.contest,
        id
      );
      console.log(latestParticipation);
      if (!latestParticipation) {
        return response.sendError(
          res,
          "You are not allowed to submit to this contest",
          403
        );
      }
      const now = new Date();
      if (
        latestParticipation.startTime &&
        now >= latestParticipation.startTime &&
        now <= latestParticipation.endTime
      ) {
        body.type = "contest";
        body.contestType = latestParticipation.mode;
        body.contestParticipant = latestParticipation._id;
      } else {
        return response.sendError(
          res,
          "You are not allowed to submit to this contest",
          403
        );
      }
    } else {
      body.contest = null;
    }
    let submission = await SubmissionModel.create(body);
    submission = await submission.populate(
      "problem",
      "numberOfTestCases time memory"
    );
    // body.
    await sendMessage("submission-topic", submission);

    //testing
    // const submission = await SubmissionModel.findById('68deb1c1043f748a29a7e2ab')
    //     .populate('problem', 'numberOfTestCases time memory');
    return response.sendSuccess(res, submission);
  } catch (error) {
    console.log(error);
    return response.sendError(res, error);
  }
};

export const getSubmissionsByUserId = async (req, res) => {
  try {
    const userId = req.params.id;
    const {
      limit = 10,
      page = 1,
      language,
      problemId,
      contestParticipant,
      classroomId,
      excludeClassroom
    } = req.query; //Truyền classroomId vào
    const skip = (page - 1) * limit;
    const filter = {
      user: userId,
    };
    if (problemId) {
      filter.problem = problemId;
    }
    if (language !== "all" && language) {
      filter.language = language;
    }
    if (contestParticipant) {
      filter.contestParticipant = contestParticipant;
      console.log(contestParticipant);
    }
    if (classroomId) {
      filter.classroom = classroomId;
    }
    if (excludeClassroom === 'true') {
      filter.classroom = null;
    }
    const userIdJWT = req.user?._id;
    if (userIdJWT && userIdJWT.toString() !== userId){
      filter.isPrivate = false;
    }
    const submissions = await SubmissionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "userName")
      .populate("problem", "name");
    const total = await SubmissionModel.countDocuments(filter);
    // sendMessageToUser(userId, 'submission-update', submissions)
    return response.sendSuccess(res, pageDTO(submissions, total, page, limit));
  } catch (error) {
    console.log(error);
    return response.sendError(res, error);
  }
};

export const getBestSubmissionByUserId = async (req, res) => {
  try {
    const userId = req.params.id; 
    const { problemId, classroomId, excludeClassroom } = req.query;

    console.log('📥 Getting best submission:', { userId, problemId, classroomId, excludeClassroom });

    // Validate required params
    if (!problemId) {
      return response.sendError(res, "Problem ID is required", 400);
    }

    const filter = {
      user: userId,
      problem: problemId,
      status: Status.AC,
    };

    // Apply classroom filter
    if (classroomId) {
      filter.classroom = classroomId;
    } else if (excludeClassroom === 'true') {
      filter.classroom = null;
    }

    // Find best submission (lowest time, then lowest memory)
    const bestSubmission = await SubmissionModel.findOne(filter)
      .sort({ time: 1, memory: 1, createdAt: -1 }) // Sort by time ASC, memory ASC, newest first
      .populate("user", "userName fullName avatar")
      .populate("problem", "name shortId");

    if (!bestSubmission) {
      return response.sendError(res, "No accepted submission found", 404);
    }

    console.log('✅ Best submission found:', bestSubmission.shortId);
    return response.sendSuccess(res, bestSubmission);
  } catch (error) {
    console.error('❌ Get best submission error:', error);
    return response.sendError(res, error);
  }
};

export const getSubmission = async (req, res) => {
  try {
    const { userId, problemId, contestId, status } = req.query;
    const { limit = 10, page = 1, language } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};

    if (userId) {
      filter.user = userId;
    }

    if (problemId) {
      filter.problem = problemId;
    }

    if (language !== "all" && language) {
      filter.language = language;
    }

    if (contestId){
      filter.contest = contestId;
    }

    if (status){
        filter.status = status;
    }

    const submissions = await SubmissionModel.find(filter)
        .populate("user", "userName")
        .populate("problem", "name")
        .populate('contest', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SubmissionModel.countDocuments(filter);
    return response.sendSuccess(res, pageDTO(submissions, total, page, limit));
  } catch (error) {
    console.log(error);
    return response.sendError(res, error);
  }
};

export const getSubmissionById = async (req, res) => {
  try {
    const id = req.params.id;
    const submission = await SubmissionModel.findById(id)
        .populate("user", "userName")
        .populate("problem", "name shortId")
        .populate('contest', 'title code');
    if (!submission) {
        return response.sendError(res, "Submission not found", 404);
    }
    const user = req.user;
    if (submission.isPrivate) {
      if (!user || (user._id.toString() !== submission.user._id.toString() && user.role !== 'admin')) {
        return response.sendError(res, "You are not allowed to view this submission", 403);
      }
    }
    return response.sendSuccess(res, submission);
  } catch (error) {
    console.log(error);
    return response.sendError(res, error);
  }
};

export const getUserSubmissionCalendar = async (req, res) => {
  try {
    const { year } = req.query;
    let startDate, endDate;
    if (!year) {
      const today = new Date();
      const lastYear = new Date();
      lastYear.setDate(lastYear.getDate() - 365);
      startDate = lastYear;
      endDate = today;
    } else {
      const firstDayOfYear = new Date(year, 0, 1);
      const lastDayOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
      startDate = firstDayOfYear;
      endDate = lastDayOfYear;
    }

    const submissions = await SubmissionModel.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.params.id),
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "Asia/Ho_Chi_Minh",
            },
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          count: 1,
        },
      },
    ]);

    const submissionMap = new Map(submissions.map((s) => [s.date, s.count]));

    const allDates = [];
    let current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0]; // YYYY-MM-DD
      allDates.push({
        date: dateStr,
        count: submissionMap.get(dateStr) || 0, // nếu không có thì count = 0
      });
      current.setDate(current.getDate() + 1);
    }
    return response.sendSuccess(res, allDates);
  } catch (error) {
    console.log(error);
    return response.sendError(res, error);
  }
};

export const getSubmissionStatusChartByUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      return response.sendError(res, "User ID is required", 400);
    }

    const statusCounts = await SubmissionModel.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          status: { $nin: ["Pending", null] },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          count: 1,
        },
      },
    ]);
    let cnt = 0;
    for (const status of statusCounts) {
      cnt += status.count;
    }

    return response.sendSuccess(res, { chart: statusCounts, total: cnt });
  } catch (error) {
    console.log(error);
    return response.sendError(res, error);
  }
};

export const getSubmissionDifficultyChart = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      return response.sendError(res, "User ID is required", 400);
    }

    const statusCounts = await SubmissionModel.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          status: { $eq: "Accepted" },
        },
      },
      {
        // JOIN với collection Problem để lấy thông tin difficulty
        $lookup: {
          from: "problems", // tên collection (thường là lowercase + 's')
          localField: "problem",
          foreignField: "_id",
          as: "problemDetails",
        },
      },
      {
        // Unwind array từ $lookup
        $unwind: "$problemDetails",
      },
      {
        // Group theo difficulty
        $group: {
          _id: "$problemDetails.difficulty",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          difficulty: "$_id",
          count: 1,
        },
      },
    ]);
    let cnt = 0;
    for (const status of statusCounts) {
      cnt += status.count;
    }

    return response.sendSuccess(res, { chart: statusCounts, total: cnt });
  } catch (error) {
    console.log(error);
    return response.sendError(res, error);
  }
};


export const getSubmissionStatistics = async (req, res) => {
    try {
        const totalSubmissions = await SubmissionModel.countDocuments();
        const acSubmissions = await SubmissionModel.countDocuments({ status: Status.AC });
        const waSubmission = await SubmissionModel.countDocuments({ status: Status.WA });
        const otherSubmission = totalSubmissions - (acSubmissions + waSubmission);
        return response.sendSuccess(res, {
            totalSubmissions,
            acSubmissions,
            waSubmission,
            otherSubmission,
        });
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}
