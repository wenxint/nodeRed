const express = require("express");
const router = express.Router();
const createUpload = require("../../middleware/upload");
const upload = createUpload();
const path = require("path");
const protobuf = require("protobufjs");
const fs = require("fs");
const { AppError } = require("../../middleware/errorHandler");

async function convertBase64ToJson(protoFilePath, base64, input) {
  try {
    // 验证输入参数
    // if (!protoFilePath || !base64 || !input || !Array.isArray(input) || input.length === 0) {
    //   throw new Error('无效的输入参数');
    // }

    console.log(`开始解析，Proto文件路径: ${protoFilePath}`);
    console.log(`输入参数: ${JSON.stringify(input)}`);

    // 将Base64字符串转换为Buffer
    const buffer = Buffer.from(base64, "base64");

    // 确保Proto目录路径正确
    const protoDir = path.join(__dirname, "..", "..", "Proto");
    console.log(`Proto目录: ${protoDir}`);

    // 创建一个新的Root实例
    console.log("正在创建Root实例...");
    const root = new protobuf.Root();

    // 用于跟踪已加载的文件和命名空间
    const loadedFiles = new Set();
    const loadedNamespaces = new Map();

    // 设置包含目录，用于解析import语句
    root.resolvePath = function (origin, target) {
      // 处理相对路径
      if (target.startsWith(".")) {
        const resolvedPath = path.resolve(path.dirname(origin), target);
        console.log(
          `解析相对路径: ${target} -> ${resolvedPath} (相对于 ${origin})`
        );
        return resolvedPath;
      }

      // 尝试在不同目录中查找目标文件
      const searchDirs = [
        path.dirname(origin), // 首先检查当前文件所在目录
        protoDir,
        path.join(protoDir, "pkg"),
        path.join(protoDir, "pkg", "proto"),
        path.dirname(protoFilePath),
        // 添加更多可能的目录
        path.join(protoDir, "google", "protobuf"),
        path.join(protoDir, "corepb"),
        path.join(protoDir, "clientpb"),
      ];

      for (const dir of searchDirs) {
        const fullPath = path.join(dir, target);
        if (fs.existsSync(fullPath)) {
          console.log(`找到目标文件: ${target} -> ${fullPath}`);
          return fullPath;
        }
      }

      // 如果找不到，记录警告并返回原始目标路径
      console.log(`警告: 无法解析导入路径 ${target} (相对于 ${origin})`);
      return target;
    };

    // 递归加载所有依赖的proto文件
    console.log("正在加载Proto文件...");

    // 定义一个函数来递归加载proto文件及其依赖
    async function loadProtoWithDependencies(filePath) {
      // 规范化文件路径以确保一致性
      const normalizedPath = path.normalize(filePath);

      if (loadedFiles.has(normalizedPath)) {
        console.log(`跳过已加载的文件: ${normalizedPath}`);
        return; // 避免重复加载
      }

      if (!fs.existsSync(normalizedPath)) {
        throw new Error(`Proto文件不存在: ${normalizedPath}`);
      }

      loadedFiles.add(normalizedPath);
      console.log(`加载proto文件: ${normalizedPath}`);

      // 读取proto文件内容
      const content = fs.readFileSync(normalizedPath, "utf8");

      // 解析package语句以获取命名空间
      const packageMatch = content.match(/package\s+([\w\.]+)\s*;/);
      const packageName = packageMatch ? packageMatch[1] : null;

      // 检查文件中定义的消息类型
      const messageTypeRegex = /message\s+(\w+)\s*\{/g;
      const messageTypes = [];
      let messageMatch;
      while ((messageMatch = messageTypeRegex.exec(content)) !== null) {
        messageTypes.push(messageMatch[1]);
      }

      // 检查是否有重复定义的消息类型，不仅限于google.protobuf包
      if (packageName) {
        let hasConflict = false;
        for (const type of messageTypes) {
          const fullTypeName = `${packageName}.${type}`;
          try {
            // 尝试查找类型，如果已存在则记录冲突
            if (root.lookup(fullTypeName)) {
              console.log(
                `检测到重复定义的类型: ${fullTypeName} in ${normalizedPath}`
              );
              hasConflict = true;
              // 对于google.protobuf包，直接跳过整个文件
              if (packageName === "google.protobuf") {
                console.log(
                  `跳过google.protobuf包中的重复文件: ${normalizedPath}`
                );
                return; // 跳过整个文件，避免重复定义
              }
            }
          } catch (e) {
            // 查找失败不代表类型不存在，可能是其他原因
            console.log(`查找类型 ${fullTypeName} 时出错: ${e.message}`);
          }
        }

        // 如果存在冲突且已经加载了相同命名空间的文件，则跳过当前文件
        if (hasConflict && loadedNamespaces.has(packageName)) {
          const existingFile = loadedNamespaces.get(packageName);
          console.log(
            `警告: 命名空间 ${packageName} 已在文件 ${existingFile} 中定义，跳过加载 ${normalizedPath}`
          );
          return;
        }
      }

      // 解析import语句
      const importRegex = /import\s+"([^"]+)"/g;
      let match;
      const imports = [];

      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }

      // 先加载所有依赖
      for (const importPath of imports) {
        const resolvedPath = root.resolvePath(normalizedPath, importPath);
        await loadProtoWithDependencies(resolvedPath);
      }

      // 加载当前文件
      try {
        // 记录命名空间和文件路径
        if (packageName) {
          loadedNamespaces.set(packageName, normalizedPath);
        }

        // 使用更安全的加载选项
        await root.load(normalizedPath, {
          keepCase: true,
          alternateCommentMode: true,
          preferTrailingComment: true,
          // 增加容错选项
          alternateCommentMode: true,
          preferTrailingComment: true,
        });
        console.log(`成功加载文件: ${normalizedPath}`);
      } catch (error) {
        console.error(`加载文件 ${normalizedPath} 失败:`, error.message);
        // 对于特定错误，尝试更宽松的处理方式而不是直接失败
        if (
          error.message.includes("duplicate name") ||
          error.message.includes("already defined")
        ) {
          console.log(`警告: 文件 ${normalizedPath} 包含重复定义，尝试跳过...`);
          // 不抛出错误，允许继续处理其他文件
          return;
        }
        throw error;
      }
    }

    // 开始加载主proto文件及其依赖
    await loadProtoWithDependencies(protoFilePath);
    console.log("Proto文件加载成功");

    // 获取消息类型
    console.log(`查找消息类型: ${input.join(".")}`);
    // 修正类型名称：CSAct0152Service.GameEnd应该是一个RPC方法，而不是消息类型
    // 需要查找对应的请求或响应消息类型
    let typeName = Array.isArray(input) ? input[0] : input;

    // 检查是否是服务方法，如果是则转换为对应的请求或响应类型
    if (typeName.includes("Service.")) {
      // 从服务方法名提取方法名
      const parts = typeName.split(".");
      const methodName = parts[parts.length - 1];
      const packagePrefix = parts.slice(0, parts.length - 2).join(".");

      // 默认尝试查找响应类型（通常是我们需要解码的）
      typeName = `${packagePrefix}.${methodName}Reply`;
      console.log(`尝试查找响应类型: ${typeName}`);
    }

    console.log(`实际查找的类型名称: ${typeName}`);
    const Response = root.lookupType(typeName);
    console.log("消息类型查找成功");

    // 将buffer解码为对象
    console.log("开始解码Buffer...");
    const decoded = Response.decode(buffer);
    console.log("Buffer解码成功");

    // 转换为纯JavaScript对象
    const object = Response.toObject(decoded, {
      defaults: true,
      arrays: true,
      objects: true,
      longs: String,
      enums: String,
      bytes: String,
    });
    console.log("转换为JavaScript对象成功");

    return object;
  } catch (error) {
    console.error("解析失败:", error);
    throw new AppError(400, `解析失败: ${error.message}`);
  }
}

// 文件上传接口
router.post("/proto/submit", upload.single("file"), async (req, res, next) => {
  try {
    // 添加详细的请求信息日志
    // console.log("Content-Type:", req.headers["content-type"]);
    // console.log("请求体大小:", req.headers["content-length"]);
    // console.log("完整请求头:", req.headers);
    // console.log("是否包含文件:", !!req.file);

    const protoPath = path.join(
      __dirname,
      "..",
      "..",
      "Proto",
      "pkg",
      "proto",
      "actpb",
      "act0152pb",
      "act0152.proto"
    );
    console.log(protoPath, "protoPath");

    const base64 =
      "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";
    const input = ["actpb.act0152pb.CSAct0152Service.GameEnd"];

    // 获取文件信息和路径
    // const fileUrl = `/static/${req.file.filename}`; // 文件的URL路径
    // const filePath = req.file.path;

    // 调用convertBase64ToJson处理文件内容和base64字符串
    const jsonResult = await convertBase64ToJson(protoPath, base64, input);

    const fileInfo = {
      // uid: Date.now().toString(), // 生成唯一ID

      // originalname: req.file.originalname,
      // mimetype: req.file.mimetype,
      // size: req.file.size,
      // path: fileUrl,
      // input: input, // 添加input字段
      result: jsonResult, // 添加转换结果
    };

    // 返回文件信息和处理结果
    res.json({
      success: true,
      message: "文件处理成功",
      data: fileInfo,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
