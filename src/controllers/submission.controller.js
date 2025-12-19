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

export const getAllSubmissionStatusStatistics = async (req, res) => {
  try {
    // Get filter params (optional)
    const { userId, problemId, contestId, classroomId, startDate, endDate } = req.query;

    // Build base filter
    let filter = {};

    // Apply filters if provided
    if (userId) {
      filter.user = new mongoose.Types.ObjectId(userId);
    }

    if (problemId) {
      filter.problem = new mongoose.Types.ObjectId(problemId);
    }

    if (contestId) {
      filter.contest = new mongoose.Types.ObjectId(contestId);
    }

    if (classroomId) {
      filter.classroom = new mongoose.Types.ObjectId(classroomId);
    }

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    // Count total submissions
    const totalSubmissions = await SubmissionModel.countDocuments(filter);

    // Get status counts using aggregation
    const statusCounts = await SubmissionModel.aggregate([
      {
        $match: filter
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          count: 1
        }
      },
      {
        $sort: { count: -1 } // Sort by count descending
      }
    ]);

    // Create status map for easy access
    const statusMap = {};
    statusCounts.forEach(item => {
      statusMap[item.status] = item.count;
    });

    // Define all possible statuses with their counts
    const allStatuses = {
      [Status.AC]: statusMap[Status.AC] || 0,
      [Status.WA]: statusMap[Status.WA] || 0,
      [Status.TLE]: statusMap[Status.TLE] || 0,
      [Status.MLE]: statusMap[Status.MLE] || 0,
      [Status.RE]: statusMap[Status.RE] || 0,
      [Status.CE]: statusMap[Status.CE] || 0,
      [Status.Pending]: statusMap[Status.Pending] || 0,
      [Status.IE]: statusMap[Status.IE] || 0,
    };

    // Calculate percentages
    const statusPercentages = {};
    Object.keys(allStatuses).forEach(status => {
      statusPercentages[status] = totalSubmissions > 0
        ? ((allStatuses[status] / totalSubmissions) * 100).toFixed(2)
        : "0.00";
    });

    // Calculate acceptance rate
    const acceptedCount = allStatuses[Status.AC];
    const acceptanceRate = totalSubmissions > 0
      ? ((acceptedCount / totalSubmissions) * 100).toFixed(2)
      : "0.00";

    // Get additional statistics
    const uniqueUsers = await SubmissionModel.distinct('user', filter);
    const uniqueProblems = await SubmissionModel.distinct('problem', filter);

    // Get average submission time (for accepted submissions)
    const avgTimeResult = await SubmissionModel.aggregate([
      {
        $match: {
          ...filter,
          status: Status.AC,
          time: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: "$time" },
          maxTime: { $max: "$time" },
          minTime: { $min: "$time" }
        }
      }
    ]);

    const timeStats = avgTimeResult.length > 0
      ? {
          average: Math.round(avgTimeResult[0].avgTime),
          max: avgTimeResult[0].maxTime,
          min: avgTimeResult[0].minTime
        }
      : {
          average: 0,
          max: 0,
          min: 0
        };

    // Get average memory (for accepted submissions)
    const avgMemoryResult = await SubmissionModel.aggregate([
      {
        $match: {
          ...filter,
          status: Status.AC,
          memory: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          avgMemory: { $avg: "$memory" },
          maxMemory: { $max: "$memory" },
          minMemory: { $min: "$memory" }
        }
      }
    ]);

    const memoryStats = avgMemoryResult.length > 0
      ? {
          average: Math.round(avgMemoryResult[0].avgMemory),
          max: avgMemoryResult[0].maxMemory,
          min: avgMemoryResult[0].minMemory
        }
      : {
          average: 0,
          max: 0,
          min: 0
        };

    // Get submissions by language
    const languageStats = await SubmissionModel.aggregate([
      {
        $match: filter
      },
      {
        $group: {
          _id: "$language",
          count: { $sum: 1 },
          accepted: {
            $sum: { $cond: [{ $eq: ["$status", Status.AC] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          language: "$_id",
          total: "$count",
          accepted: 1,
          acceptanceRate: {
            $cond: [
              { $gt: ["$count", 0] },
              { $multiply: [{ $divide: ["$accepted", "$count"] }, 100] },
              0
            ]
          }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);

    console.log('✅ All submission status statistics retrieved successfully');

    return response.sendSuccess(res, {
      total: totalSubmissions,
      acceptanceRate: parseFloat(acceptanceRate),
      
      // Status counts
      statusCounts: allStatuses,
      
      // Status percentages
      statusPercentages: Object.keys(statusPercentages).reduce((acc, key) => {
        acc[key] = parseFloat(statusPercentages[key]);
        return acc;
      }, {}),
      
      // Detailed status breakdown
      statusBreakdown: statusCounts,
      
      // User and problem statistics
      statistics: {
        uniqueUsers: uniqueUsers.length,
        uniqueProblems: uniqueProblems.length,
        averageSubmissionsPerUser: uniqueUsers.length > 0
          ? (totalSubmissions / uniqueUsers.length).toFixed(2)
          : "0.00",
        averageSubmissionsPerProblem: uniqueProblems.length > 0
          ? (totalSubmissions / uniqueProblems.length).toFixed(2)
          : "0.00"
      },
      
      // Performance statistics (for AC submissions)
      performance: {
        time: timeStats,
        memory: memoryStats
      },
      
      // Language statistics
      languageStatistics: languageStats,
      
      // Applied filters
      filters: {
        userId: userId || null,
        problemId: problemId || null,
        contestId: contestId || null,
        classroomId: classroomId || null,
        startDate: startDate || null,
        endDate: endDate || null
      }
    });

  } catch (error) {
    console.error('❌ Error getting all submission status statistics:', error);
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

export const getSubmissionsByClassroom = async (req, res) => {
  try {
    const classroom = req.classroom;
    
    // Get query params for filtering
    const { 
      userId, 
      problemId, 
      contestId, 
      status,
      language,
      limit = 20, 
      page = 1 
    } = req.query;
    
    const skip = (page - 1) * limit;

    let filter = {
      classroom: classroom._id
    };

    // Apply additional filters
    if (userId) {
      filter.user = userId;
    }

    if (problemId) {
      filter.problem = problemId;
    }

    if (contestId) {
      filter.contest = contestId;
    }

    if (status) {
      filter.status = status;
    }

    if (language && language !== "all") {
      filter.language = language;
    }

    // Get submissions with pagination
    const submissions = await SubmissionModel.find(filter)
      .populate("user", "userName fullName email studentCode avatar")
      .populate("problem", "name shortId difficulty")
      .populate("contest", "title code")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SubmissionModel.countDocuments(filter);


    return response.sendSuccess(res, pageDTO(submissions, total, page, limit));
  } catch (error) {
    console.error('❌ Get classroom submissions error:', error);
    return response.sendError(res, error);
  }
};
export const getClassroomSubmissionStatistics = async (req, res) => {
  try {
    // ✅ classroom already loaded and verified by verifyClassroomTeacher middleware
    const classroom = req.classroom;
    const classroomId = classroom._id;

    // Get filter params
    const { userId, problemId, contestId } = req.query;

    // Base filter for classroom
    let filter = {
      classroom: classroomId
    };

    // Apply additional filters
    if (userId) {
      filter.user = userId;
    }

    if (problemId) {
      filter.problem = problemId;
    }

    if (contestId) {
      filter.contest = contestId;
    }

    // Count total submissions
    const totalSubmissions = await SubmissionModel.countDocuments(filter);

    // Count AC submissions
    const acSubmissions = await SubmissionModel.countDocuments({
      ...filter,
      status: Status.AC
    });

    // Count WA submissions
    const waSubmissions = await SubmissionModel.countDocuments({
      ...filter,
      status: Status.WA
    });

    // Count TLE submissions
    const tleSubmissions = await SubmissionModel.countDocuments({
      ...filter,
      status: Status.TLE
    });

    // Count MLE submissions
    const mleSubmissions = await SubmissionModel.countDocuments({
      ...filter,
      status: Status.MLE
    });

    // Count RE submissions
    const reSubmissions = await SubmissionModel.countDocuments({
      ...filter,
      status: Status.RE
    });

    // Count CE submissions
    const ceSubmissions = await SubmissionModel.countDocuments({
      ...filter,
      status: Status.CE
    });

    // Count Pending submissions
    const pendingSubmissions = await SubmissionModel.countDocuments({
      ...filter,
      status: Status.Pending
    });

    // Calculate other submissions
    const otherSubmissions = totalSubmissions - (
      acSubmissions + 
      waSubmissions + 
      tleSubmissions + 
      mleSubmissions + 
      reSubmissions + 
      ceSubmissions + 
      pendingSubmissions
    );

    // Get unique users count (students who submitted)
    const uniqueUsers = await SubmissionModel.distinct('user', filter);
    const activeStudents = uniqueUsers.length;

    // Get unique problems count
    const uniqueProblems = await SubmissionModel.distinct('problem', filter);
    const problemsAttempted = uniqueProblems.length;

    // Calculate acceptance rate
    const acceptanceRate = totalSubmissions > 0 
      ? ((acSubmissions / totalSubmissions) * 100).toFixed(2) 
      : 0;

    console.log(`✅ Statistics for classroom ${classroom.classCode}:`, {
      totalSubmissions,
      acSubmissions,
      activeStudents
    });

    return response.sendSuccess(res, {
      classroom: {
        _id: classroom._id,
        classCode: classroom.classCode,
        className: classroom.className
      },
      totalSubmissions,
      acSubmissions,
      waSubmissions,
      tleSubmissions,
      mleSubmissions,
      reSubmissions,
      ceSubmissions,
      pendingSubmissions,
      otherSubmissions,
      activeStudents,
      problemsAttempted,
      acceptanceRate: parseFloat(acceptanceRate)
    });
  } catch (error) {
    console.error('❌ Get classroom submission statistics error:', error);
    return response.sendError(res, error);
  }
};