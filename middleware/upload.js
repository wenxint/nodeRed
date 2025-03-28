const multer = require('multer');
const path = require('path');

// 配置文件存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../static'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// 创建可配置的multer实例
const createUpload = () => {
  const config = {
    storage: storage,
    // 添加文件大小限制，默认是无限制
    limits: {
      // fileSize: 10 * 1024 * 1024 // 10MB
    },
    // 添加文件过滤器，用于调试
    fileFilter: function (req, file, cb) {
      console.log('收到文件上传请求:', file);
      // 接受所有文件
      cb(null, true);
    }
  };

  return multer(config);
};

module.exports = createUpload;