const express = require("express");
const router = express.Router();
const createUpload = require("../../middleware/upload");

const path = require("path");
const protobuf = require("protobufjs");
const fs = require("fs");
const { AppError } = require("../../middleware/errorHandler");
const ResponseHelper = require("../../common/response");

// 缓存已加载的Root实例，避免重复加载
const rootCache = new Map();

/**
 * 根据包名查找proto文件路径
 * @param {string} packageName - 包名，例如 actpb.act0152pb
 * @returns {string|null} proto文件路径或null
 */
function findProtoFileByPackage(packageName) {
  console.log(packageName, "packageName");

  try {
    console.log(`尝试查找包 ${packageName} 的proto文件`);

    // 处理包含服务名的情况，例如 actpb.act0152pb.CSAct0152Service
    const parts = packageName.split(".");
    const targetFolder = parts[parts.length - 2]; // 获取目标文件夹名，例如 act0152pb

    // 构建基础目录路径
    const baseDir = path.join(__dirname, "..", "..", "Proto");

    // 递归查找目标文件夹
    function findTargetFolder(dir) {
      try {
        const items = fs.readdirSync(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stats = fs.statSync(fullPath);

          if (stats.isDirectory()) {
            // 如果找到目标文件夹
            if (item === targetFolder) {
              // 获取文件夹中的文件
              const files = fs.readdirSync(fullPath);
              const protoFile = files.find((file) => file.endsWith(".proto"));

              if (protoFile) {
                const filePath = path.join(fullPath, protoFile);
                console.log(`找到proto文件: ${filePath}`);
                return filePath;
              }
            }
            // 递归搜索子目录
            const result = findTargetFolder(fullPath);
            if (result) return result;
          }
        }
        return null;
      } catch (err) {
        console.error(`搜索目录失败: ${err.message}`);
        return null;
      }
    }

    const result = findTargetFolder(baseDir);
    if (!result) {
      console.warn(`未找到包 ${packageName} 的proto文件`);
    }
    return result;
  } catch (error) {
    console.error(`查找proto文件失败: ${error.message}`);
    return null;
  }
}

/**
 * 将Base64编码的protobuf数据转换为JSON对象
 * @param {string} protoFilePath - proto文件路径
 * @param {string} base64 - base64编码的protobuf数据
 * @param {string|string[]} input - 消息类型名称或包含类型名称的数组
 * @returns {Promise<Object>} 解析后的JSON对象
 */
async function convertBase64ToJson(protoFilePath, base64, input) {
  try {
    // 验证输入参数
    if (!protoFilePath || !base64) {
      throw new AppError(400, "无效的输入参数");
    }

    // 将Base64字符串转换为Buffer
    const buffer = Buffer.from(base64, "base64");

    // 确保Proto目录路径正确
    const protoDir = path.join(__dirname, "..", "..", "Proto");

    // 检查缓存中是否已有加载好的Root实例
    const cacheKey = protoFilePath;
    let root;

    if (rootCache.has(cacheKey)) {
      root = rootCache.get(cacheKey);
    } else {
      // 创建一个新的Root实例
      root = new protobuf.Root();

      // 设置包含目录，用于解析import语句
      root.resolvePath = function (origin, target) {
        // 处理相对路径
        if (target.startsWith(".")) {
          return path.resolve(path.dirname(origin), target);
        }

        // 尝试在不同目录中查找目标文件
        const searchDirs = [
          path.dirname(origin),
          protoDir,
          path.join(protoDir, "pkg"),
          path.join(protoDir, "pkg", "proto"),
          path.dirname(protoFilePath),
          path.join(protoDir, "google", "protobuf"),
          path.join(protoDir, "corepb"),
          path.join(protoDir, "clientpb"),
        ];

        for (const dir of searchDirs) {
          const fullPath = path.join(dir, target);
          if (fs.existsSync(fullPath)) {
            return fullPath;
          }
        }

        // 如果找不到，返回原始目标路径
        return target;
      };

      // 加载proto文件
      try {
        await root.load(protoFilePath, {
          keepCase: true,
          alternateCommentMode: true,
          preferTrailingComment: true,
        });

        // 将加载好的Root实例缓存起来
        rootCache.set(cacheKey, root);
      } catch (error) {
        throw new AppError(400, `Proto文件加载失败: ${error.message}`);
      }
    }

    // 智能处理服务方法名称转换为响应类型
    let typeName = Array.isArray(input) ? input[0] : input;

    // 检查是否是服务方法，如果是则转换为对应的响应类型
    if (typeName.includes("Service.")) {
      const parts = typeName.split(".");
      const methodName = parts[parts.length - 1];
      const packagePrefix = parts.slice(0, parts.length - 2).join(".");
      typeName = `${packagePrefix}.${methodName}Reply`;
    } else {
      const parts = typeName.split(".");
      typeName = parts[parts.length - 2];
    }
    console.log(typeName, "typeName");

    // 查找消息类型并解码
    const Response = root.lookupType(typeName);
    const decoded = Response.decode(buffer);

    // 转换为纯JavaScript对象并返回
    return Response.toObject(decoded, {
      defaults: true,
      arrays: true,
      objects: true,
      longs: String,
      enums: String,
      bytes: String,
    });
  } catch (error) {
    console.error("解析失败:", error);
    throw new AppError(400, `解析失败: ${error.message}`);
  }
}

/**
 * 解析sendStr格式的请求
 * 旧格式: packageIndex, packageName, methodName, ..., base64Data
 * 新格式: [timestamp] packageIndex, packageName, methodName, ..., base64Data
 * 例如: [34031872.000000]        2, actpb.actbasepb.CSActService, ActEntranceDetail, 58, 74, 0:        base64Data
 */
router.post("/proto/submit", async (req, res, next) => {
  try {
    const { sendStr } = req.body;

    if (!sendStr) {
      throw new AppError(400, "缺少sendStr参数");
    }

    // 初始化变量
    let headerPart;
    let timestamp = null;

    // 检查是否是新格式（带有时间戳）
    const timestampMatch = sendStr.match(/^\s*\[([\d\.]+)\]\s*/);
    let processedStr = sendStr;

    // 如果找到时间戳格式，提取时间戳并移除这部分
    if (timestampMatch) {
      timestamp = parseFloat(timestampMatch[1]);
      // 移除时间戳部分，保留剩余字符串
      processedStr = sendStr.substring(timestampMatch[0].length);
    }

    // 解析sendStr字符串
    const colonIndex = processedStr.indexOf(":");
    if (colonIndex === -1) {
      throw new AppError(400, "sendStr格式不正确，缺少冒号分隔符");
    }

    // 提取冒号前的部分并按逗号分割
    headerPart = processedStr.substring(0, colonIndex).trim();
    console.log(headerPart, "headerPart");

    const parts = headerPart.split(",").map((part) => part.trim());

    if (parts.length < 3) {
      throw new AppError(400, "sendStr格式不正确，缺少必要参数");
    }

    // 提取包名和方法名
    const packageName = parts[1]; // 例如: actpb.act0152pb.CSAct0152Service
    const methodName = parts[2]; // 例如: GameEnd 或 ActEntranceDetail

    console.log(packageName, "packageName");
    console.log(methodName, "methodName");

    // 提取base64数据（冒号后的所有内容）
    const base64Data = processedStr.substring(colonIndex + 1).trim();

    // 使用findProtoFileByPackage查找proto文件
    const protoFilePath = findProtoFileByPackage(packageName);

    if (!protoFilePath) {
      throw new AppError(404, `未找到包 ${packageName} 的proto文件`);
    }

    // 构建完整的类型名称
    const fullTypeName = `${packageName}.${methodName}`;

    // 调用convertBase64ToJson处理数据
    const jsonResult = await convertBase64ToJson(
      protoFilePath,
      base64Data,
      fullTypeName
    );

    // 使用统一响应格式返回结果
    return ResponseHelper.success(
      res,
      {
        timestamp, // 添加时间戳到返回结果
        packageName,
        methodName,
        protoFile: protoFilePath,
        result: jsonResult,
      },
      "解析成功"
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
