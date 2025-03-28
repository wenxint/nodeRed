const express = require("express");
const router = express.Router();
const createUpload = require('../../middleware/upload');
const upload = createUpload();
const path = require('path');

// 文件上传接口
router.post("/proto/submit", upload.single('file'), async (req, res) => {
  // 添加详细的请求信息日志
  console.log('Content-Type:', req.headers['content-type']);
  console.log('请求体大小:', req.headers['content-length']);
  console.log('完整请求头:', req.headers);
  console.log('是否包含文件:', !!req.file);

  if (!req.body || !req.body.input) {
    return res.status(400).json({
      success: false,
      message: '请提供input参数'
    });
  }
  const input = req.body.input;
  console.log('请求体:', req.body);
  console.log('文件信息:', req.file);
  console.log('请求头:', req.headers);

  try {
    // 检查是否有文件上传
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传文件'
      });
    }

    // 获取文件信息和路径
    const fileUrl = `/static/${req.file.filename}`; // 文件的URL路径
    const fileInfo = {
      uid: Date.now().toString(), // 生成唯一ID
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: fileUrl,
      input: input // 添加input字段
    };

    // 返回文件信息和上传成功消息
    res.json({
      success: true,
      message: '文件上传成功',
      data: fileInfo
    });
  } catch (error) {
    console.error('文件上传错误:', error);
    res.status(500).json({
      success: false,
      message: '文件上传失败',
      error: error.message
    });
  }
});

module.exports = router;