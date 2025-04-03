const express = require("express");
const router = express.Router();
const createUpload = require("../../middleware/upload");
const upload = createUpload();
const path = require("path");
const protobuf = require("protobufjs");
const fs = require("fs");
const { AppError } = require("../../middleware/errorHandler");

// 缓存已加载的Root实例，避免重复加载
const rootCache = new Map();

/**
 * 根据包名查找proto文件路径
 * @param {string} packageName - 包名，例如 actpb.act0152pb
 * @returns {string|null} proto文件路径或null
 */
function findProtoFileByPackage(packageName) {
  try {
    console.log(`尝试查找包 ${packageName} 的proto文件`);

    // 处理包含服务名的情况，例如 actpb.act0152pb.CSAct0152Service
    // 需要提取实际的包名部分，忽略服务名
    const parts = packageName.split(".");

    // 检查最后一个部分是否是服务名（通常包含Service字样）
    const lastPart = parts[parts.length - 1];
    const isServiceName = lastPart.includes("Service");

    // 如果最后一个部分是服务名，则忽略它
    const packageParts = isServiceName
      ? parts.slice(0, parts.length - 1)
      : parts;

    // 构建基础目录路径
    const baseDir = path.join(__dirname, "..", "..", "Proto", "pkg", "proto");

    // 尝试查找包目录
    let packageDir = "";
    let validPathFound = true;

    for (const part of packageParts) {
      packageDir = path.join(baseDir, packageDir, part);
      if (!fs.existsSync(packageDir)) {
        console.warn(`目录不存在: ${packageDir}`);
        validPathFound = false;
        break;
      }
    }

    // 如果找到有效路径，尝试在该目录中查找proto文件
    if (validPathFound) {
      // 提取模块名，通常是倒数第二个部分，例如从 actpb.act0152pb 提取 act0152pb
      const moduleName = packageParts[packageParts.length - 1];

      // 构建可能的文件名模式
      const possibleFileNames = [
        `${moduleName.replace("pb", "")}.proto`, // act0152.proto
        "api.proto",
        `${moduleName}.proto`, // act0152pb.proto
      ];

      // 在包目录中查找proto文件
      for (const fileName of possibleFileNames) {
        const filePath = path.join(packageDir, fileName);
        if (fs.existsSync(filePath)) {
          console.log(`找到proto文件: ${filePath}`);
          return filePath;
        }
      }
    }

    // 如果上面的方法找不到，尝试更灵活的搜索方式
    // 例如，对于 actpb.act0152pb.CSAct0152Service，尝试直接查找 act0152pb 目录
    if (!validPathFound && packageParts.length >= 2) {
      const possibleModuleNames = [
        packageParts[packageParts.length - 1], // 最后一个部分
        packageParts[1], // 第二个部分（通常是模块名）
      ];

      for (const moduleName of possibleModuleNames) {
        // 尝试直接构建路径
        const directPath = path.join(baseDir, packageParts[0], moduleName);

        if (fs.existsSync(directPath)) {
          console.log(`找到可能的模块目录: ${directPath}`);

          // 构建可能的文件名
          const possibleFileNames = [
            `${moduleName.replace("pb", "")}.proto`, // act0152.proto
            "api.proto",
            `${moduleName}.proto`, // act0152pb.proto
          ];

          // 在目录中查找proto文件
          for (const fileName of possibleFileNames) {
            const filePath = path.join(directPath, fileName);
            if (fs.existsSync(filePath)) {
              console.log(`找到proto文件: ${filePath}`);
              return filePath;
            }
          }
        }
      }
    }

    console.warn(`未找到包 ${packageName} 的proto文件`);
    return null;
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
    }

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
 * 格式: packageIndex, packageName, methodName, ..., base64Data
 * 例如: 2, actpb.act0152pb.CSAct0152Service, GameEnd, 188, 227, 0: base64Data
 */
router.post("/proto/submit", async (req, res, next) => {
  try {
    const { sendStr } = req.body;

    if (!sendStr) {
      throw new AppError(400, "缺少sendStr参数");
    }

    // 解析sendStr字符串
    // 格式: packageIndex, packageName, methodName, ..., base64Data
    const colonIndex = sendStr.indexOf(":");
    if (colonIndex === -1) {
      throw new AppError(400, "sendStr格式不正确，缺少冒号分隔符");
    }

    // 提取冒号前的部分并按逗号分割
    const headerPart = sendStr.substring(0, colonIndex).trim();
    const parts = headerPart.split(",").map((part) => part.trim());

    if (parts.length < 3) {
      throw new AppError(400, "sendStr格式不正确，缺少必要参数");
    }

    // 提取包名和方法名
    const packageName = parts[1]; // 例如: actpb.act0152pb.CSAct0152Service
    const methodName = parts[2]; // 例如: GameEnd

    // 提取base64数据（冒号后的所有内容）
    const base64Data = sendStr.substring(colonIndex + 1).trim();

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

    // 返回结果
    res.json({
      success: true,
      message: "解析成功",
      data: {
        packageName,
        methodName,
        protoFile: protoFilePath,
        result: jsonResult,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
