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
    console.log(targetFolder, "targetFolder");

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

              /**
               * 优先查找与 targetFolder 同名的 .proto 文件，
               * 如果没有则查找去掉 pb 后的 targetFolder 名称的 .proto 文件
               * @param {string[]} files - 目录下所有文件名
               * @param {string} targetFolder - 目标文件夹名
               * @returns {string|undefined} 匹配到的 proto 文件名
               */
              function findProtoFile(files, targetFolder) {
                // 1. 优先查找同名
                const exactMatch = files.find(
                  (file) => file === `${targetFolder}.proto`
                );
                if (exactMatch) return exactMatch;

                // 2. 查找去掉pb后缀的同名
                const withoutPb = targetFolder.replace(/_?pb$/i, "");
                if (withoutPb && withoutPb !== targetFolder) {
                  const pbMatch = files.find(
                    (file) => file === `${withoutPb}.proto`
                  );
                  if (pbMatch) return pbMatch;
                }

                // 3. 没有找到
                return undefined;
              }

              const protoFile = findProtoFile(files, targetFolder);

              if (protoFile) {
                console.log(fullPath, "fullPath");

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
 * @param {number} resType - 协议类型，1表示请求，其他表示响应
 * @returns {Promise<Object>} 解析后的JSON对象
 */
async function convertBase64ToJson(protoFilePath, base64, input, resType) {
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

    // 智能处理服务方法名称转换为请求或响应类型
    let typeName = Array.isArray(input) ? input[0] : input;
    console.log(`原始类型名: ${typeName}, 协议类型: ${resType}`);

    // 检查是否是服务方法，如果是则根据resType决定转换为请求类型还是响应类型
    if (typeName.includes("Service.")) {
      const parts = typeName.split(".");
      const methodName = parts[parts.length - 1];
      const packagePrefix = parts.slice(0, parts.length - 2).join(".");

      // 根据resType决定使用Request还是Reply后缀
      if (resType === 1) {
        typeName = `${packagePrefix}.${methodName}Request`;
        console.log(`根据resType=1, 使用Request类型: ${typeName}`);
      } else {
        typeName = `${packagePrefix}.${methodName}Reply`;
        console.log(`根据resType!=1, 使用Reply类型: ${typeName}`);
      }
    } else {
      // 如果不包含Service，使用原有逻辑
      const parts = typeName.split(".");
      typeName = parts[parts.length - 2];
      console.log(`非服务类型，取倒数第二部分: ${typeName}`);
    }

    try {
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
      console.error(`使用 ${typeName} 解析失败, 尝试智能类型匹配...`);

      // 如果指定类型解析失败，尝试智能类型匹配
      const possibleTypes = [];
      const parts = typeName.split(".");
      const methodName = parts[parts.length - 1].replace(/Request$|Reply$/, "");
      const packagePrefix = parts.slice(0, parts.length - 1).join(".");

      // 尝试多种可能的类型名
      possibleTypes.push(`${packagePrefix}.${methodName}`);
      possibleTypes.push(`${packagePrefix}.${methodName}Request`);
      possibleTypes.push(`${packagePrefix}.${methodName}Reply`);
      possibleTypes.push(`${packagePrefix}.${methodName}Req`);
      possibleTypes.push(`${packagePrefix}.${methodName}Res`);
      possibleTypes.push(`${packagePrefix}.${methodName}Response`);
      possibleTypes.push(typeName); // 原始类型名

      console.log(`尝试的类型: ${possibleTypes.join(', ')}`);

      // 尝试所有可能的类型
      for (const type of possibleTypes) {
        try {
          console.log(`尝试类型: ${type}`);
          const messageType = root.lookupType(type);
          const decoded = messageType.decode(buffer);
          console.log(`成功使用类型 ${type} 解码`);

          return messageType.toObject(decoded, {
            defaults: true,
            arrays: true,
            objects: true,
            longs: String,
            enums: String,
            bytes: String,
          });
        } catch (e) {
          console.log(`类型 ${type} 解码失败: ${e.message}`);
          // 继续尝试下一个类型
        }
      }

      // 如果都失败了，抛出异常
      throw new AppError(400, `解析失败: ${error.message}, 尝试了类型: ${possibleTypes.join(', ')}`);
    }
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

    console.log(`收到请求: ${sendStr.substring(0, 100)}${sendStr.length > 100 ? '...' : ''}`);

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
      console.log(`提取到时间戳: ${timestamp}`);
    }

    // 标准化字符串，将制表符替换为空格
    processedStr = processedStr.replace(/\t/g, ' ');

    // 解析sendStr字符串
    const colonIndex = processedStr.indexOf(":");
    if (colonIndex === -1) {
      throw new AppError(400, "sendStr格式不正确，缺少冒号分隔符");
    }

    // 提取冒号前的部分并按逗号分割
    headerPart = processedStr.substring(0, colonIndex).trim();
    console.log(`提取头部: ${headerPart}`);

    const parts = headerPart.split(",").map((part) => part.trim());

    if (parts.length < 3) {
      throw new AppError(400, "sendStr格式不正确，缺少必要参数");
    }

    // 提取resType（协议类型）
    const resType = parseInt(parts[0], 10);
    console.log(`提取resType: ${resType}`);

    // 提取包名和方法名
    const packageName = parts[1]; // 例如: actpb.act0152pb.CSAct0152Service
    const methodName = parts[2]; // 例如: GameEnd 或 ActEntranceDetail

    console.log(`包名: ${packageName}`);
    console.log(`方法名: ${methodName}`);

    // 提取base64数据（冒号后的所有内容）
    const base64Data = processedStr.substring(colonIndex + 1).trim();
    console.log(`base64数据长度: ${base64Data.length}`);

    // 使用findProtoFileByPackage查找proto文件
    const protoFilePath = findProtoFileByPackage(packageName);

    if (!protoFilePath) {
      throw new AppError(404, `未找到包 ${packageName} 的proto文件`);
    }
    console.log(`找到proto文件: ${protoFilePath}`);

    // 构建完整的类型名称
    const fullTypeName = `${packageName}.${methodName}`;
    console.log(`完整类型名: ${fullTypeName}, resType: ${resType}`);

    // 调用convertBase64ToJson处理数据，传入resType参数
    const jsonResult = await convertBase64ToJson(
      protoFilePath,
      base64Data,
      fullTypeName,
      resType
    );

    // 使用统一响应格式返回结果
    return ResponseHelper.success(
      res,
      {
        timestamp, // 添加时间戳到返回结果
        packageName,
        methodName,
        resType,
        protoFile: protoFilePath,
        result: jsonResult,
      },
      "解析成功"
    );
  } catch (error) {
    console.error("路由处理失败:", error);
    next(error);
  }
});

module.exports = router;
