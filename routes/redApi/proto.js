const express = require("express");
const router = express.Router();
const createUpload = require('../../middleware/upload');
const upload = createUpload();
const path = require('path');

// 文件上传接口
router.post("/proto/submit", upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    // 获取文件信息
    const fileInfo = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}` // 文件的访问路径
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