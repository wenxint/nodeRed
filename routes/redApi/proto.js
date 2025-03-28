const express = require("express");
const router = express.Router();
const createUpload = require("../../middleware/upload");
const upload = createUpload();
const path = require("path");
const protobuf = require("protobufjs");
const fs = require("fs");

async function convertBase64ToJson(protoFilePath, base64, input) {
  try {
    // 将Base64字符串转换为Buffer
    const buffer = Buffer.from(base64, "base64");

    // 加载proto文件
    const root = await protobuf.load(protoFilePath);

    // 获取消息类型
    const Response = root.lookupType([...input]);

    // 将buffer解码为对象
    const decoded = Response.decode(buffer);

    // 转换为纯JavaScript对象
    const object = Response.toObject(decoded, {
      defaults: true,
      arrays: true,
      objects: true,
      longs: String,
      enums: String,
      bytes: String,
    });

    return object;
  } catch (error) {
    console.error("Base64解析失败:", error);
    throw error;
  }
}

// 文件上传接口
router.post("/proto/submit", upload.single("file"), async (req, res) => {
  // 添加详细的请求信息日志
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("请求体大小:", req.headers["content-length"]);
  console.log("完整请求头:", req.headers);
  console.log("是否包含文件:", !!req.file);

  if (!req.body.input) {
    return res.status(400).json({
      success: false,
      message: "请提供input参数",
    });
  }
  if (!req.body.base64) {
    return res.status(400).json({
      success: false,
      message: "请提供base64参数",
    });
  }
  const input = req.body.input.split(",");
  const base64 = req.body.base64;
  console.log("请求体:", req.body);
  console.log("文件信息:", req.file);
  console.log("请求头:", req.headers);

  try {
    // 检查是否有文件上传
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "请上传文件",
      });
    }

    // 获取文件信息和路径
    const fileUrl = `/static/${req.file.filename}`; // 文件的URL路径
    const filePath = req.file.path;

    try {
      // 调用convertBase64ToJson处理文件内容和base64字符串
      const jsonResult = await convertBase64ToJson(
        filePath,
        base64,
        input
      );

      const fileInfo = {
        uid: Date.now().toString(), // 生成唯一ID
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: fileUrl,
        input: input, // 添加input字段
        result: jsonResult, // 添加转换结果
      };

      // 返回文件信息和处理结果
      res.json({
        success: true,
        message: "文件处理成功",
        data: fileInfo,
      });
    } catch (error) {
      throw new Error(`处理Proto文件失败: ${error.message}`);
    }
  } catch (error) {
    console.error("文件上传错误:", error);
    res.status(500).json({
      success: false,
      message: "文件上传失败",
      error: error.message,
    });
  }
});

module.exports = router;
