import response from "../helpers/response.js";
import {uploadFile} from "../service/s3.service.js";
import problemModels from "../models/problem.models.js";
import {CustomZipProcessor} from "../method/zip.method.js";
import {pageDTO} from "../helpers/dto.helpers.js";
import {getLatestSubmissionByUser} from "../service/sumission.service.js";

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
        problem.zipName = req.file.originalname;
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
        const userId = req.user._id;
        problem.createBy = userId;
        console.log(userId)
        if (problem.classroomId) {
            problem.classRoom = problem.classroomId;
            problem.isPrivate = true;
        }

        const createdProblem = await problemModels.create(problem);
        console.log(userId)
        return response.sendSuccess(res, createdProblem);
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}

export const updateProblem = async (req, res) => {
    try{
        const problemId = req.params.id;
        const problemUpdates = req.body;
        const problem = await problemModels.findById(problemId);
        if (problem == null) {
            return response.sendError(res, "Problem not found", 404);
        }
        Object.assign(problem, problemUpdates);
        await problemModels.updateOne({ _id: problemId }, problem);
        return response.sendSuccess(res, problem);
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}


export const getProblemById = async (req, res) => {
    try{
        const id = req.params.id;
        const problem = await problemModels.findById(id,  {numberOfTestcases: 0});
        return response.sendSuccess(res, problem);
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}

export const getProblems = async (req, res) => {
    try{
        const {name, tag, difficulty, page, size} = req.query;
        let filter = {};
        if (name) {
            filter.name = { $regex: name, $options: 'i' }; // Case-insensitive regex search
        }
        if (tag) {
            filter.tags = tag; // Exact match for tags
        }
        if (difficulty) {
            filter.difficulty = difficulty; // Exact match for difficulty
        }
        filter.isActive = true;
        filter.isPrivate = false;
        const pageNumber = parseInt(page) || 1;
        const pageSize = parseInt(size) || 20;
        const skip = (pageNumber - 1) * pageSize;
        console.log(filter);
        console.log(skip, ' ', pageSize);
        const problems = await problemModels.find(filter, {numberOfTestcases: 0}).sort({createdAt: -1}).skip(skip).limit(pageSize);
        const total = await problemModels.countDocuments(filter);
        return response.sendSuccess(res, pageDTO(problems, total, pageNumber, pageSize));
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}


export const getProblemByShortId = async (req, res) => {
    try{
        const id = req.params.id;
        let problem = await problemModels.findOne({shortId: id}, {numberOfTestcases: 0});
        if (!problem) {
            return response.sendError(res, "Problem not found", 404);
        }

        // Check if problem is private (classroom-only)
        if (problem.classRoom) {
            // If user not logged in, deny access
            if (!req.user) {
                return response.sendError(res, "You must be logged in to access this problem", 401);
            }

            // Check if user has access to this classroom
            const classroomModel = (await import('../models/classroom.model.js')).default;
            const classroom = await classroomModel.findById(problem.classRoom);
            
            if (!classroom) {
                return response.sendError(res, "Classroom not found", 404);
            }

            const userId = req.user._id;
            const isTeacher = classroom.isTeacher(userId);
            const isStudent = classroom.isStudent(userId);
            const isAdmin = req.user.role === 'admin';

            if (!isTeacher && !isStudent && !isAdmin) {
                return response.sendError(res, "You don't have access to this problem", 403);
            }
        }
        let lastSubmission = null;
        if (req.user) {
            const userId = req.user._id;
            lastSubmission = await getLatestSubmissionByUser(userId, problem._id);
        }
        return response.sendSuccess(res, {
            ...problem._doc, // hoặc ...problem._doc nếu dùng Mongoose
            lastSubmission
        });
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}

export const getProblemStats = async (req, res) => {
    try{
        const filter = { classRoom: null }
         const totalProblems = await problemModels.countDocuments(filter);
        const easyProblems = await problemModels.countDocuments({...filter, difficulty: 'Easy'});
        const mediumProblems = await problemModels.countDocuments({...filter, difficulty: 'Medium'});
        const hardProblems = await problemModels.countDocuments({...filter, difficulty: 'Hard'});
        return response.sendSuccess(res, {
            totalProblems,
            easyProblems,
            mediumProblems,
            hardProblems
        });
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}

export const getAllProblem = async (req, res) => {
    try{
        let {name, tag, difficulty, page, size, sortBy, order} = req.query;
        let filter = {};
        if (name) {
            filter.$or = [
                { name: { $regex: name, $options: 'i' } },
                { shortId: { $regex: name, $options: 'i' } }
            ];
        }
        if (tag) {
            filter.tags = tag;
        }
        if (difficulty) {
            filter.difficulty = difficulty;
        }
        // if (classroomId === 'null' || classroomId === 'public') {
        //     filter.classRoom = null; // Public problems only
        // } 
        // else if (classroomId) {
        //     filter.classRoom = classroomId;
        // }

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

        // adding _id to sort
        const sortOptions = {[sortBy]: order, _id: order};

        const problems = await problemModels.find(filter, {numberOfTestcases: 0})
            .sort(sortOptions)
            .skip(skip)
            .limit(pageSize);
        const total = await problemModels.countDocuments(filter);
        return response.sendSuccess(res, pageDTO(problems, total, pageNumber, pageSize));
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}

export const toggleStatus = async (req, res) => {
    try{
        const problemId = req.params.id;
        const problem = await problemModels.findById(problemId);
        if (problem == null) {
            return response.sendError(res, "Problem not found", 404);
        }
        problem.isActive = problem.isActive ^ 1;
        await problemModels.updateOne({ _id: problemId }, problem);
        return response.sendSuccess(res, 'Problem hidden successfully');
    }
    catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
}

export const getProblemsByClassroom = async (req, res) => {
    try {
        const { classroomId } = req.params;
        const { page = 1, size = 20 } = req.query;

        const pageNumber = parseInt(page);
        const pageSize = parseInt(size);
        const skip = (pageNumber - 1) * pageSize;

        const filter = {
            classRoom: classroomId,
            isActive: true
        };

        const problems = await problemModels
            .find(filter, { numberOfTestcases: 0 })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageSize);

        const total = await problemModels.countDocuments(filter);

        return response.sendSuccess(res, pageDTO(problems, total, pageNumber, pageSize));
    } catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
};

/**
 * Get public problems (not in classroom) for selection
 */
export const getPublicProblemsForSelection = async (req, res) => {
    try {
        const { name, tag, difficulty, page = 1, size = 20, excludeClassroom } = req.query;
        
        let filter = {
            isActive: true,
            isPrivate: false,
            classRoom: null // Only public problems
        };

        if (name) {
            filter.$or = [
                { name: { $regex: name, $options: 'i' } },
                { shortId: { $regex: name, $options: 'i' } }
            ];
        }
        
        if (tag) {
            filter.tags = tag;
        }
        
        if (difficulty) {
            filter.difficulty = difficulty;
        }

        const pageNumber = parseInt(page);
        const pageSize = parseInt(size);
        const skip = (pageNumber - 1) * pageSize;

        //  If excludeClassroom is provided, find by classCode instead of _id
        if (excludeClassroom) {
            const classroomModel = (await import('../models/classroom.model.js')).default;
            const classroom = await classroomModel.findOne({ 
                classCode: excludeClassroom.toUpperCase() // Changed from findById to findOne with classCode
            });
            
            if (classroom) {
                const existingProblemIds = classroom.problems.map(p => p.problemShortId);
                if (existingProblemIds.length > 0) {
                    filter.shortId = { $nin: existingProblemIds };
                }
            }
        }

        const problems = await problemModels
            .find(filter, { numberOfTestcases: 0 })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageSize)
            .select('name shortId difficulty tags numberOfSubmissions numberOfAccepted statement');

        const total = await problemModels.countDocuments(filter);

        return response.sendSuccess(res, pageDTO(problems, total, pageNumber, pageSize));
    } catch (error) {
        console.log(error);
        return response.sendError(res, error);
    }
};

/**
 * Get problems created by current logged-in user
 * Query params: classroomId, name, difficulty, tag, page, size
 */
export const getMyProblems = async (req, res) => {
    try {
        const userId = req.user._id;
        const { classroomId, name, difficulty, tag, page = 1, size = 20, sortBy = 'createdAt', order = 'desc' } = req.query;

        // Build filter
        let filter = {
            createBy: userId
        };

        // Filter by classroomId
        if (classroomId) {
            if (classroomId === 'null' || classroomId === 'public') {
                filter.classRoom = null; // Public problems only
            } else {
                filter.classRoom = classroomId;
            }
        }

        // Filter by name (search in name and shortId)
        if (name) {
            filter.$or = [
                { name: { $regex: name, $options: 'i' } },
                { shortId: { $regex: name, $options: 'i' } }
            ];
        }

        // Filter by difficulty
        if (difficulty) {
            filter.difficulty = difficulty;
        }

        // Filter by tag
        if (tag) {
            filter.tags = tag;
        }

        // Pagination
        const pageNumber = parseInt(page);
        const pageSize = parseInt(size);
        const skip = (pageNumber - 1) * pageSize;

        // Sort options
        const sortOrder = order.toLowerCase() === 'asc' ? 1 : -1;
        const sortOptions = { [sortBy]: sortOrder, _id: sortOrder };

        console.log('📝 My problems filter:', filter);
        console.log('📊 Sort:', sortOptions);

        // ✅ FIX: Không populate classRoom, sẽ manually populate sau
        const problems = await problemModels
            .find(filter, { numberOfTestcases: 0 })
            .sort(sortOptions)
            .skip(skip)
            .limit(pageSize)
            .lean(); // ✅ Use lean() để get plain objects

        const total = await problemModels.countDocuments(filter);

        // ✅ Manually populate classroom info để tránh lỗi virtual
        const classroomModel = (await import('../models/classroom.model.js')).default;
        const classroomIds = problems
            .map(p => p.classRoom)
            .filter(id => id !== null && id !== undefined);

        let classroomsMap = {};
        if (classroomIds.length > 0) {
            const classrooms = await classroomModel
                .find({ _id: { $in: classroomIds } })
                .select('_id className classCode')
                .lean();
            
            classroomsMap = classrooms.reduce((map, classroom) => {
                map[classroom._id.toString()] = classroom;
                return map;
            }, {});
        }

        // ✅ Attach classroom info to problems
        const problemsWithClassroom = problems.map(problem => ({
            ...problem,
            classRoom: problem.classRoom ? classroomsMap[problem.classRoom.toString()] || null : null
        }));

        // Get statistics by classroom
        const stats = await problemModels.aggregate([
            { $match: { createBy: userId } },
            {
                $group: {
                    _id: '$classRoom',
                    count: { $sum: 1 },
                    active: { $sum: { $cond: ['$isActive', 1, 0] } },
                    private: { $sum: { $cond: ['$isPrivate', 1, 0] } }
                }
            }
        ]);

        console.log('✅ Found', problemsWithClassroom.length, 'problems');

        return response.sendSuccess(res, {
            ...pageDTO(problemsWithClassroom, total, pageNumber, pageSize),
            stats
        });
    } catch (error) {
        console.error('❌ Error getting my problems:', error);
        return response.sendError(res, error.message || 'Error getting my problems', 500);
    }
};