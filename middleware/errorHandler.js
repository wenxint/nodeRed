// 自定义错误类
class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const ResponseHelper = require('../common/response');

// 开发环境错误处理
const sendErrorDev = (err, res) => {
  // 使用统一响应格式
  return res.status(err.statusCode).json({
    success: false,
    message: err.message,
    error: {
      stack: err.stack,
      ...err
    }
  });
};

// 生产环境错误处理
const sendErrorProd = (err, res) => {
  // 可操作的错误：发送给客户端
  if (err.isOperational) {
    // 使用统一响应格式
    return ResponseHelper.error(res, err.message, err.statusCode);
  }
  // 编程错误：不泄露错误详情
  else {
    // 记录错误
    console.error('ERROR 💥', err);

    // 使用统一响应格式
    return ResponseHelper.error(res, '服务器内部错误', 500);
  }
};

// 全局错误处理中间件
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // 处理常见错误类型
    if (error.name === 'CastError') {
      error = new AppError(400, `无效的${error.path}: ${error.value}`);
    }
    if (error.code === 11000) {
      error = new AppError(400, '该记录已存在');
    }
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(el => el.message);
      error = new AppError(400, `无效输入: ${errors.join('. ')}`);
    }

    sendErrorProd(error, res);
  }
};

module.exports = {
  AppError,
  errorHandler
};