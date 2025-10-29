/**
 * Fuzzy Search Utility
 * Hỗ trợ tìm kiếm mờ (fuzzy search) cho tiếng Việt và tiếng Anh
 * Kết nối trực tiếp với MongoDB
 */

/**
 * Cấu hình độ mờ cho fuzzy search
 */
export const FUZZY_LEVELS = {
  STRICT: {
    threshold: 0.7,
    maxDistance: 2,
    description: 'Tìm kiếm chính xác, ít dung sai'
  },
  NORMAL: {
    threshold: 0.5,
    maxDistance: 4,
    description: 'Cân bằng giữa chính xác và linh hoạt'
  },
  LOOSE: {
    threshold: 0.3,
    maxDistance: 6,
    description: 'Tìm kiếm linh hoạt, nhiều kết quả'
  }
};

/**
 * Chuyển đổi tiếng Việt có dấu sang không dấu
 */
export const removeVietnameseTones = (str) => {
  if (!str) return '';
  
  str = str.toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  
  return str;
};

/**
 * Tính độ tương đồng Levenshtein distance
 */
export const levenshteinDistance = (str1, str2) => {
  const matrix = [];

  if (str1.length === 0) return str2.length;
  if (str2.length === 0) return str1.length;

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
};

/**
 * Tính độ tương đồng giữa 2 chuỗi (0-1)
 */
export const similarity = (str1, str2) => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
};

/**
 * Tạo MongoDB regex query hỗ trợ fuzzy search
 */
export const buildFuzzySearchQuery = (searchTerm, fields, options = {}) => {
  const {
    caseSensitive = false,
    removeAccents = true,
    exactMatch = false
  } = options;

  if (!searchTerm || !searchTerm.trim()) {
    return {};
  }

  const trimmedSearch = searchTerm.trim();
  
  if (exactMatch) {
    return {
      $or: fields.map(field => ({
        [field]: caseSensitive ? trimmedSearch : { $regex: `^${trimmedSearch}$`, $options: 'i' }
      }))
    };
  }

  const patterns = [trimmedSearch];
  
  if (removeAccents) {
    const noAccentPattern = removeVietnameseTones(trimmedSearch);
    if (noAccentPattern !== trimmedSearch) {
      patterns.push(noAccentPattern);
    }
  }

  const orConditions = [];
  
  fields.forEach(field => {
    patterns.forEach(pattern => {
      orConditions.push({
        [field]: { 
          $regex: pattern, 
          $options: caseSensitive ? '' : 'i' 
        }
      });
      
      const words = pattern.split(/\s+/);
      if (words.length > 1) {
        words.forEach(word => {
          if (word.length > 1) {
            orConditions.push({
              [field]: { 
                $regex: word, 
                $options: caseSensitive ? '' : 'i' 
              }
            });
          }
        });
      }
    });
  });

  return { $or: orConditions };
};

/**
 * Tìm kiếm fuzzy trực tiếp trên MongoDB model
 * @param {Model} model - Mongoose model
 * @param {string} searchTerm - Từ khóa tìm kiếm
 * @param {Array<string>} fields - Các trường cần tìm kiếm
 * @param {Object} options - Tùy chọn
 * @returns {Promise<Array>} - Kết quả tìm kiếm
 */
export const fuzzySearch = async (model, searchTerm, fields, options = {}) => {
  const {
    additionalQuery = {},
    select = '',
    populate = '',
    limit = 100,
    skip = 0,
    sort = {},
    fuzzyLevel = 'NORMAL',
    caseSensitive = false,
    removeAccents = true
  } = options;

  // Build fuzzy query
  const fuzzyQuery = buildFuzzySearchQuery(searchTerm, fields, {
    caseSensitive,
    removeAccents
  });

  // Merge với additional query
  const finalQuery = Object.keys(fuzzyQuery).length > 0
    ? { ...additionalQuery, ...fuzzyQuery }
    : additionalQuery;

  // Execute query
  let query = model.find(finalQuery);

  if (select) query = query.select(select);
  if (populate) query = query.populate(populate);
  if (Object.keys(sort).length > 0) query = query.sort(sort);
  
  query = query.skip(skip).limit(limit);

  const results = await query.lean().exec();

  // Filter and sort by relevance
  const config = FUZZY_LEVELS[fuzzyLevel] || FUZZY_LEVELS.NORMAL;
  const filteredResults = filterAndSortByRelevance(
    results,
    searchTerm,
    fields,
    config.threshold
  );

  return filteredResults;
};

/**
 * Đếm số lượng kết quả fuzzy search
 * @param {Model} model - Mongoose model
 * @param {string} searchTerm - Từ khóa tìm kiếm
 * @param {Array<string>} fields - Các trường cần tìm kiếm
 * @param {Object} additionalQuery - Query bổ sung
 * @returns {Promise<number>} - Số lượng kết quả
 */
export const fuzzyCount = async (model, searchTerm, fields, additionalQuery = {}) => {
  const fuzzyQuery = buildFuzzySearchQuery(searchTerm, fields);
  
  const finalQuery = Object.keys(fuzzyQuery).length > 0
    ? { ...additionalQuery, ...fuzzyQuery }
    : additionalQuery;

  return await model.countDocuments(finalQuery);
};

/**
 * Fuzzy search với phân trang
 * @param {Model} model - Mongoose model
 * @param {string} searchTerm - Từ khóa tìm kiếm
 * @param {Array<string>} fields - Các trường cần tìm kiếm
 * @param {Object} options - Tùy chọn phân trang
 * @returns {Promise<Object>} - Kết quả với phân trang
 */
export const fuzzySearchPaginated = async (model, searchTerm, fields, options = {}) => {
  const {
    page = 1,
    limit = 10,
    additionalQuery = {},
    select = '',
    populate = '',
    sort = { createdAt: -1 },
    fuzzyLevel = 'NORMAL',
    caseSensitive = false,
    removeAccents = true
  } = options;

  const skip = (page - 1) * limit;

  // Build query
  const fuzzyQuery = buildFuzzySearchQuery(searchTerm, fields, {
    caseSensitive,
    removeAccents
  });

  const finalQuery = Object.keys(fuzzyQuery).length > 0
    ? { ...additionalQuery, ...fuzzyQuery }
    : additionalQuery;

  // Get total count
  const total = await model.countDocuments(finalQuery);

  // Execute query
  let query = model.find(finalQuery);

  if (select) query = query.select(select);
  if (populate) query = query.populate(populate);
  if (Object.keys(sort).length > 0) query = query.sort(sort);
  
  query = query.skip(skip).limit(limit);

  let results = await query.lean().exec();

  // Filter and sort by relevance
  if (searchTerm && searchTerm.trim()) {
    const config = FUZZY_LEVELS[fuzzyLevel] || FUZZY_LEVELS.NORMAL;
    results = filterAndSortByRelevance(
      results,
      searchTerm,
      fields,
      config.threshold
    );
  }

  return {
    data: results,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Tìm kiếm suggestions từ database
 * @param {Model} model - Mongoose model
 * @param {string} searchTerm - Từ khóa tìm kiếm
 * @param {Array<string>} fields - Các trường để tìm kiếm
 * @param {Object} options - Tùy chọn
 * @returns {Promise<Array>} - Mảng suggestions
 */
export const fuzzySearchSuggestions = async (model, searchTerm, fields, options = {}) => {
  const {
    limit = 5,
    additionalQuery = {},
    fuzzyLevel = 'NORMAL'
  } = options;

  if (!searchTerm || !searchTerm.trim()) {
    return [];
  }

  const fuzzyQuery = buildFuzzySearchQuery(searchTerm, fields);
  const finalQuery = Object.keys(fuzzyQuery).length > 0
    ? { ...additionalQuery, ...fuzzyQuery }
    : additionalQuery;

  // Lấy kết quả
  const results = await model
    .find(finalQuery)
    .select(fields.join(' '))
    .limit(limit * 3) // Lấy nhiều hơn để filter
    .lean()
    .exec();

  // Generate suggestions
  const suggestions = generateSuggestions(results, searchTerm, fields, limit, fuzzyLevel);

  return suggestions;
};

/**
 * Lọc và sắp xếp kết quả theo độ tương đồng
 */
export const filterAndSortByRelevance = (results, searchTerm, fields, threshold = 0.3) => {
  if (!searchTerm || !results || results.length === 0) {
    return results;
  }

  const normalizedSearch = removeVietnameseTones(searchTerm.toLowerCase());

  const scoredResults = results.map(item => {
    let maxScore = 0;
    let matchedField = null;

    fields.forEach(field => {
      const value = item[field];
      if (!value) return;

      const normalizedValue = removeVietnameseTones(value.toLowerCase());
      let score = 0;

      if (normalizedValue === normalizedSearch) {
        score = 1.0;
      } else if (normalizedValue.startsWith(normalizedSearch)) {
        score = 0.9;
      } else if (normalizedValue.includes(normalizedSearch)) {
        score = 0.7;
      } else {
        score = similarity(normalizedSearch, normalizedValue);
      }

      const words = normalizedSearch.split(/\s+/);
      const matchedWords = words.filter(word => 
        normalizedValue.includes(word)
      ).length;
      score += (matchedWords / words.length) * 0.2;

      if (score > maxScore) {
        maxScore = score;
        matchedField = field;
      }
    });

    return {
      ...item,
      _relevanceScore: maxScore,
      _matchedField: matchedField
    };
  });

  return scoredResults
    .filter(item => item._relevanceScore >= threshold)
    .sort((a, b) => b._relevanceScore - a._relevanceScore);
};

/**
 * Tạo suggestions từ một tập dữ liệu
 */
export const generateSuggestions = (data, searchTerm, fields, limit = 5, fuzzyLevel = 'NORMAL') => {
  if (!searchTerm || !data || data.length === 0) {
    return [];
  }

  const config = FUZZY_LEVELS[fuzzyLevel] || FUZZY_LEVELS.NORMAL;
  const normalizedSearch = removeVietnameseTones(searchTerm.toLowerCase());
  const suggestions = new Set();

  data.forEach(item => {
    fields.forEach(field => {
      const value = item[field];
      if (!value) return;

      const normalizedValue = removeVietnameseTones(value.toLowerCase());
      
      if (normalizedValue.includes(normalizedSearch)) {
        suggestions.add(value);
      }

      const words = value.split(/\s+/);
      words.forEach(word => {
        const normalizedWord = removeVietnameseTones(word.toLowerCase());
        if (normalizedWord.includes(normalizedSearch)) {
          suggestions.add(word);
        }
      });
    });
  });

  return Array.from(suggestions)
    .slice(0, limit)
    .sort((a, b) => {
      const scoreA = similarity(normalizedSearch, removeVietnameseTones(a.toLowerCase()));
      const scoreB = similarity(normalizedSearch, removeVietnameseTones(b.toLowerCase()));
      return scoreB - scoreA;
    });
};

/**
 * Highlight matching text
 */
export const highlightMatch = (text, searchTerm) => {
  if (!text || !searchTerm) return text;

  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};

export default {
  FUZZY_LEVELS,
  removeVietnameseTones,
  levenshteinDistance,
  similarity,
  buildFuzzySearchQuery,
  fuzzySearch,
  fuzzyCount,
  fuzzySearchPaginated,
  fuzzySearchSuggestions,
  filterAndSortByRelevance,
  generateSuggestions,
  highlightMatch
};