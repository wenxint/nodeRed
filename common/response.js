/**
 * @file 统一响应格式工具类
 * @description 提供统一的API响应格式方法，确保所有API返回格式一致
 */
class ResponseHelper {
  /**
   * 成功响应
   * @param {object} res - Express响应对象
   * @param {any} data - 返回数据
   * @param {string} message - 成功消息
   * @param {number} statusCode - HTTP状态码
   * @returns {object} 格式化的响应对象
   */
  static success(res, data, message = '操作成功', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  }

  /**
   * 错误响应
   * @param {object} res - Express响应对象
   * @param {string} message - 错误消息
   * @param {number} statusCode - HTTP状态码
   * @returns {object} 格式化的响应对象
   */
  static error(res, message = '操作失败', statusCode = 400) {
    return res.status(statusCode).json({
      success: false,
      message
    });
  }

  /**
   * 带分页的成功响应
   * @param {object} res - Express响应对象
   * @param {array} data - 数据列表
   * @param {number} total - 总记录数
   * @param {number} page - 当前页码
   * @param {number} limit - 每页记录数
   * @param {string} message - 成功消息
   * @param {number} statusCode - HTTP状态码
   * @returns {object} 格式化的响应对象
   */
  static page(res, data, total, page, limit, message = '操作成功', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  }
}

module.exports = ResponseHelper;