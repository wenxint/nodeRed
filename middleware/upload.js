const multer = require('multer');
const path = require('path');

// 配置文件存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// 默认的文件过滤器
const defaultFileFilter = (req, file, cb) => {
  // 默认允许所有文件类型
  cb(null, true);
};

// 默认的文件大小限制
const defaultLimits = {
  fileSize: 5 * 1024 * 1024 // 默认限制文件大小为5MB
};

// 创建可配置的multer实例
const createUpload = (options = {}) => {
  const config = {
    storage: storage,
    fileFilter: options.fileFilter || defaultFileFilter,
    limits: options.limits || defaultLimits
  };

  return multer(config);
};

module.exports = createUpload;