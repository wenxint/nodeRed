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
 * 根据包名查找proto文件路径和类型名
 * @param {string} packageName - 包名，例如 actpb.act0152pb 或 zonepb.pvppb.ascensionpb.UpdateNTF
 * @param {string} methodName - 方法名，例如 Heartbeat 或 Push
 * @param {number} resType - 协议类型，1表示请求，其他表示响应
 * @param {string} typeName - 类型名，适用于非服务调用
 * @returns {Object|null} 包含proto文件路径和类型名的对象或null
 */
function findProtoFileByPackage(packageName, methodName, resType, typeName) {
  console.log(`======== 查找包路径开始 ========`);
  console.log(`包名: ${packageName}, 方法名: ${methodName}, 协议类型: ${resType}`);

  try {
    // 处理非服务调用的特殊情况，如: zonepb.pvppb.ascensionpb.UpdateNTF
    let targetFolder, serviceName, typeName;

    if (packageName.includes('Service')) {
      // 服务调用，例如: zonepb.LobbyService
      const parts = packageName.split(".");
      targetFolder = parts.length > 1 ? parts[parts.length - 2] : parts[0]; // 获取目标文件夹名，例如 act0152pb
      serviceName = parts[parts.length - 1]; // 获取服务名，例如 CSAct0152Service
      typeName = null; // 稍后从文件内容推断
    } else {
      // 非服务调用，例如: zonepb.pvppb.ascensionpb.UpdateNTF
      const parts = packageName.split(".");
      typeName = parts.pop(); // 最后一部分是类型名，例如 UpdateNTF

      // 如果是通用消息类型，剩余部分是包名路径
      const packagePath = parts.join(".");

      // 尝试从包路径确定目标文件夹
      targetFolder = parts.length > 0 ? parts[parts.length - 1] : ''; // 最后一级目录
      serviceName = ''; // 非服务调用，没有服务名

      console.log(`非服务调用: 类型名=${typeName}, 包路径=${packagePath}, 目标文件夹=${targetFolder}`);
    }

    console.log(`目标文件夹: ${targetFolder}`);
    console.log(`服务名: ${serviceName}`);
    if (typeName) console.log(`预设类型名: ${typeName}`);

    // 构建基础目录路径
    const baseDir = path.join(__dirname, "..", "..", "Proto");
    console.log(`基础目录: ${baseDir}`);

    /**
     * 递归查找目标文件夹并返回包含文件路径和类型名的对象
     * @param {string} dir - 目录路径
     * @returns {Object|null} 包含file和typeName的对象或null
     */
    function findTargetFolder(dir) {
      try {
        const items = fs.readdirSync(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stats = fs.statSync(fullPath);

          if (stats.isDirectory()) {
            // 如果找到目标文件夹
            if (item === targetFolder) {
              console.log(`找到目标文件夹: ${fullPath}`);
              // 获取文件夹中的文件
              const files = fs.readdirSync(fullPath);
              console.log(`文件夹内容: ${files.join(', ')}`);

              // 查找proto文件并确定类型名
              const result = findProtoFileAndType(files, fullPath, targetFolder, serviceName, methodName, resType, typeName);
              if (result) {
                return result;
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

    /**
     * 查找proto文件并确定类型名
     * @param {string[]} files - 目录下所有文件名
     * @param {string} fullPath - 完整目录路径
     * @param {string} targetFolder - 目标文件夹名
     * @param {string} serviceName - 服务名
     * @param {string} methodName - 方法名
     * @param {number} resType - 协议类型，1表示请求，其他表示响应
     * @param {string} typeName - 类型名，适用于非服务调用
     * @returns {Object|null} 包含file和typeName的对象或null
     */
    function findProtoFileAndType(files, fullPath, targetFolder, serviceName, methodName, resType, typeName) {
      // 先找到合适的proto文件
      const protoFile = findProtoFile(files, targetFolder, serviceName, fullPath, typeName);

      if (!protoFile) {
        console.log(`未找到匹配的proto文件`);
        return null;
      }

      console.log(`找到proto文件: ${protoFile}`);
      const filePath = path.join(fullPath, protoFile);

      // 读取文件内容
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        console.error(`无法读取proto文件: ${filePath}, 错误: ${err.message}`);
        return null;
      }

      let finalTypeName = '';

      // 判断是服务方法还是消息类型
      if (packageName.includes('Service')) {
        // 是服务方法，需要查找对应的请求或响应类型
        console.log(`查找服务方法 ${methodName} 的${resType === 1 ? '请求' : '响应'}类型`);

        // 构建正则表达式匹配 rpc methodName(RequestType) returns (ResponseType)
        const methodRegex = new RegExp(`rpc\\s+${methodName}\\s*\\(\\s*([^\\)]+)\\s*\\)\\s*returns\\s*\\(\\s*([^\\)]+)\\s*\\)`, 'i');
        const match = content.match(methodRegex);

        if (match) {
          // 根据resType决定使用请求类型还是响应类型
          const requestType = match[1].trim();
          const responseType = match[2].trim();

          console.log(`找到方法定义: rpc ${methodName}(${requestType}) returns (${responseType})`);

          // 确定完整类型名
          // 对于请求和响应类型，检查是否包含包名
          if (resType === 1) {
            // 如果请求类型包含点，表示已经是完整的包名
            finalTypeName = requestType.includes('.') ? requestType : `${packageName.split('.').slice(0, -1).join('.')}.${requestType}`;
          } else {
            // 如果响应类型包含点，表示已经是完整的包名
            finalTypeName = responseType.includes('.') ? responseType : `${packageName.split('.').slice(0, -1).join('.')}.${responseType}`;
          }
        } else {
          console.log(`在文件中未找到方法 ${methodName} 的定义`);

          // 尝试使用通用命名规则
          const prefix = packageName.split('.').slice(0, -1).join('.');
          finalTypeName = resType === 1 ? `${prefix}.${methodName}Request` : `${prefix}.${methodName}Response`;
          console.log(`使用通用命名规则推断类型: ${finalTypeName}`);
        }
      } else {
        // 非服务调用，直接使用预设的类型名或者从文件内容推断
        if (typeName) {
          console.log(`使用预设的类型名: ${typeName}`);

          // 确定包前缀
          const packageMatch = content.match(/package\s+([^;]+);/);
          const packagePrefix = packageMatch ? packageMatch[1].trim() : '';

          // 检查类型是否已经包含完整包名
          if (typeName.includes('.')) {
            finalTypeName = typeName;
          } else if (packagePrefix) {
            finalTypeName = `${packagePrefix}.${typeName}`;
          } else {
            // 尝试从调用包名中提取前缀
            const parts = packageName.split('.');
            parts.pop(); // 移除类型名部分
            const packagePath = parts.join('.');
            finalTypeName = packagePath ? `${packagePath}.${typeName}` : typeName;
          }

          // 验证类型存在
          const typePattern = new RegExp(`(message|enum)\\s+${typeName}\\s*\\{`, 'i');
          if (!typePattern.test(content)) {
            console.log(`警告: 在文件中未找到类型 ${typeName} 的定义`);
          }
        } else {
          // 没有预设类型名，尝试从文件内容推断
          console.log(`尝试从方法名 ${methodName} 推断类型名`);

          // 检查文件中是否定义了这个消息类型
          const messageRegex = new RegExp(`message\\s+${methodName}\\s*\\{`, 'i');
          if (messageRegex.test(content)) {
            console.log(`在文件中找到消息类型 ${methodName} 的定义`);

            // 确定完整类型名
            const packageMatch = content.match(/package\s+([^;]+);/);
            const packagePrefix = packageMatch ? packageMatch[1].trim() : '';
            finalTypeName = packagePrefix ? `${packagePrefix}.${methodName}` : methodName;
          } else {
            console.log(`在文件中未找到消息类型 ${methodName} 的定义`);

            // 尝试找出文件中定义的包名
            const packageMatch = content.match(/package\s+([^;]+);/);
            if (packageMatch) {
              const filePackage = packageMatch[1].trim();
              console.log(`文件中定义的包名: ${filePackage}`);
              finalTypeName = `${filePackage}.${methodName}`;
            } else {
              // 如果文件中没有定义包名，直接使用传入的包名和方法名
              finalTypeName = packageName.includes('.') ? `${packageName}.${methodName}` : methodName;
            }
          }
        }
      }

      console.log(`确定的类型名: ${finalTypeName}`);

      return {
        file: filePath,
        typeName: finalTypeName
      };
    }

    /**
     * 查找匹配的proto文件
     * @param {string[]} files - 目录下所有文件名
     * @param {string} targetFolder - 目标文件夹名
     * @param {string} serviceName - 服务名
     * @param {string} fullPath - 完整目录路径
     * @param {string} typeName - 类型名，适用于非服务调用
     * @returns {string|null} 匹配的proto文件名或null
     */
    function findProtoFile(files, targetFolder, serviceName, fullPath, typeName) {
      // 1. 优先查找同名
      const exactMatch = files.find(
        (file) => file === `${targetFolder}.proto`
      );
      if (exactMatch) {
        console.log(`找到精确匹配的proto文件: ${exactMatch}`);
        return exactMatch;
      }

      // 2. 查找去掉pb后缀的同名
      const withoutPb = targetFolder.replace(/_?pb$/i, "");
      if (withoutPb && withoutPb !== targetFolder) {
        const pbMatch = files.find(
          (file) => file === `${withoutPb}.proto`
        );
        if (pbMatch) {
          console.log(`找到去掉pb后缀的proto文件: ${pbMatch}`);
          return pbMatch;
        }
      }

      // 3. 按文件内容匹配
      // 获取目录下所有proto文件
      const protoFiles = files.filter(file => file.endsWith('.proto'));

      // 区分服务调用和非服务调用的文件内容匹配策略
      if (serviceName) {
        // 服务调用场景: 查找包含服务名定义的文件
        console.log(`按文件名未匹配到，尝试通过文件内容查找服务: ${serviceName}`);

        for (const file of protoFiles) {
          try {
            const filePath = path.join(fullPath, file);
            const content = fs.readFileSync(filePath, 'utf8');

            // 检查文件内容是否包含服务名定义，例如"service XXXService"或"XXXService {"
            if (content.includes(`service ${serviceName}`) ||
                content.includes(`${serviceName} {`)) {
              console.log(`通过文件内容匹配到服务 ${serviceName} 在文件 ${file} 中`);
              return file;
            }
          } catch (err) {
            console.error(`读取文件 ${file} 失败: ${err.message}`);
          }
        }
      } else if (typeName) {
        // 非服务调用场景: 查找包含消息类型定义的文件
        console.log(`按文件名未匹配到，尝试通过文件内容查找类型: ${typeName}`);

        for (const file of protoFiles) {
          try {
            const filePath = path.join(fullPath, file);
            const content = fs.readFileSync(filePath, 'utf8');

            // 检查文件内容是否包含类型定义，例如"message TypeName {"或"enum TypeName {"
            const typePattern = new RegExp(`(message|enum)\\s+${typeName}\\s*\\{`, 'i');
            if (typePattern.test(content)) {
              console.log(`通过文件内容匹配到类型 ${typeName} 在文件 ${file} 中`);
              return file;
            }
          } catch (err) {
            console.error(`读取文件 ${file} 失败: ${err.message}`);
          }
        }
      } else {
        console.log(`无法进行内容匹配: 服务名和类型名都为空`);
      }

      // 4. 没有找到
      console.log(`未找到匹配的proto文件，已尝试文件名和内容匹配`);
      return null;
    }

    // 开始查找
    const result = findTargetFolder(baseDir);

    if (!result) {
      console.warn(`未找到包 ${packageName} 的proto文件或无法确定类型名`);

      // 在根目录中搜索文件的内容
      const items = fs.readdirSync(baseDir).filter(item => item.endsWith('.proto'));
      console.log(`检查根目录中的proto文件: ${items.join(', ')}`);

      for (const item of items) {
        const filePath = path.join(baseDir, item);
        try {
          const content = fs.readFileSync(filePath, 'utf8');

          // 区分服务调用和非服务调用场景
          if (serviceName) {
            // 服务调用场景
            // 检查是否包含服务名
            if (content.includes(`service ${serviceName}`) ||
                content.includes(`${serviceName} {`)) {

              console.log(`在根目录找到包含服务 ${serviceName} 的文件: ${item}`);

              // 查找方法定义
              const methodRegex = new RegExp(`rpc\\s+${methodName}\\s*\\(\\s*([^\\)]+)\\s*\\)\\s*returns\\s*\\(\\s*([^\\)]+)\\s*\\)`, 'i');
              const match = content.match(methodRegex);

              if (match) {
                const requestType = match[1].trim();
                const responseType = match[2].trim();

                console.log(`找到方法定义: rpc ${methodName}(${requestType}) returns (${responseType})`);

                // 确定包名
                const packageMatch = content.match(/package\s+([^;]+);/);
                const packagePrefix = packageMatch ? packageMatch[1].trim() : '';

                // 根据resType确定类型名
                const finalTypeName = resType === 1
                  ? (requestType.includes('.') ? requestType : `${packagePrefix}.${requestType}`)
                  : (responseType.includes('.') ? responseType : `${packagePrefix}.${responseType}`);

                return {
                  file: filePath,
                  typeName: finalTypeName
                };
              }
            }
          } else if (typeName) {
            // 非服务调用场景，查找包含指定类型的文件
            const typePattern = new RegExp(`(message|enum)\\s+${typeName}\\s*\\{`, 'i');
            if (typePattern.test(content)) {
              console.log(`在根目录找到包含类型 ${typeName} 的文件: ${item}`);

              // 确定包名
              const packageMatch = content.match(/package\s+([^;]+);/);
              const packagePrefix = packageMatch ? packageMatch[1].trim() : '';

              return {
                file: filePath,
                typeName: packagePrefix ? `${packagePrefix}.${typeName}` : typeName
              };
            }
          }
        } catch (err) {
          console.error(`读取文件 ${filePath} 失败: ${err.message}`);
        }
      }
    }

    console.log(`======== 查找包路径结束 ========`);
    return result;
  } catch (error) {
    console.error(`查找proto文件失败: ${error.message}`);
    console.error(error.stack);
    return null;
  }
}

/**
 * 将Base64编码的protobuf数据转换为JSON对象
 * @param {string} protoFilePath - proto文件路径
 * @param {string} base64 - base64编码的protobuf数据
 * @param {string} typeName - 消息类型名称
 * @returns {Promise<Object>} 解析后的JSON对象
 */
async function convertBase64ToJson(protoFilePath, base64, typeName) {
  try {
    // 验证输入参数
    if (!protoFilePath || !base64 || !typeName) {
      throw new AppError(400, `无效的输入参数: 文件路径=${!!protoFilePath}, base64=${!!base64}, 类型名=${typeName}`);
    }

    console.log(`解析参数: 文件=${protoFilePath}, 类型名=${typeName}`);
    console.log(`base64数据长度: ${base64.length}`);

    // 将Base64字符串转换为Buffer
    const buffer = Buffer.from(base64, "base64");
    console.log(`解码后buffer长度: ${buffer.length}字节`);

    // 确保Proto目录路径正确
    const protoDir = path.join(__dirname, "..", "..", "Proto");

    // 检查缓存中是否已有加载好的Root实例
    const cacheKey = protoFilePath;
    let root;

    if (rootCache.has(cacheKey)) {
      root = rootCache.get(cacheKey);
      console.log(`使用缓存的proto文件: ${cacheKey}`);
    } else {
      // 创建一个新的Root实例
      root = new protobuf.Root();
      console.log(`加载新的proto文件: ${cacheKey}`);

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

    try {
      console.log(`查找类型: ${typeName}`);
      // 查找消息类型并解码
      const Response = root.lookupType(typeName);
      const decoded = Response.decode(buffer);
      console.log(`成功解码数据`);

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
      console.error(`类型 ${typeName} 解码失败: ${error.message}`);

      // 尝试列出可用的类型进行智能匹配
      console.log(`尝试智能匹配类型...`);
      const allTypes = [];
      const typesToTry = [];

      // 收集所有可用的类型
      try {
        root.nestedArray.forEach(obj => {
          if (obj instanceof protobuf.Type) {
            allTypes.push(obj.fullName);

            // 检查类型名相似度
            if (obj.fullName.includes(typeName.split('.').pop()) ||
                typeName.includes(obj.name)) {
              typesToTry.push(obj.fullName);
            }
          }
        });

        console.log(`找到 ${allTypes.length} 个类型，尝试匹配的类型: ${typesToTry.join(', ')}`);
      } catch (e) {
        console.error(`无法列出类型: ${e.message}`);
      }

      // 尝试使用相似的类型名解码
      for (const typeToTry of typesToTry) {
        try {
          console.log(`尝试使用类型 ${typeToTry} 解码`);
          const AltResponse = root.lookupType(typeToTry);
          const decoded = AltResponse.decode(buffer);
          console.log(`使用类型 ${typeToTry} 成功解码数据`);

          // 转换为纯JavaScript对象并返回
          return AltResponse.toObject(decoded, {
            defaults: true,
            arrays: true,
            objects: true,
            longs: String,
            enums: String,
            bytes: String,
          });
        } catch (e) {
          console.log(`类型 ${typeToTry} 解码失败: ${e.message}`);
        }
      }

      // 如果所有尝试都失败，抛出原始错误
      if (allTypes.length > 0) {
        throw new AppError(400, `解码失败: ${error.message}, 可用的类型: ${allTypes.slice(0, 10).join(', ')}${allTypes.length > 10 ? '...' : ''}`);
      } else {
        throw new AppError(400, `解码失败: ${error.message}, 没有找到可用的类型`);
      }
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
 * 非服务格式: 3, zonepb.pvppb.ascensionpb.UpdateNTF, Push, 0, 389, 0: base64Data
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

    // 提取协议类型、包名和方法名
    const resType = parseInt(parts[0], 10);
    let packageName = parts[1]; // 例如: actpb.act0152pb.CSAct0152Service 或 zonepb.pvppb.ascensionpb.UpdateNTF
    let methodName = parts[2]; // 例如: GameEnd 或 Push

    // 检查是否是非服务调用格式: zonepb.pvppb.ascensionpb.UpdateNTF, Push
    // 这种格式下，UpdateNTF是类型名，不是路径的一部分
    let typeName = null;
    if (!packageName.includes('Service')) {
      // 检查包名最后一部分是否可能是类型名
      const packageParts = packageName.split('.');
      const lastPart = packageParts[packageParts.length - 1];

      // 判断特征：如果最后一部分是大写开头或包含大写字母，可能是类型名
      const isTypeName = /[A-Z]/.test(lastPart);

      if (isTypeName) {
        console.log(`检测到非服务调用格式，最后部分 ${lastPart} 可能是类型名`);

        // 将最后一部分识别为类型名
        typeName = lastPart;

        // 可选：如果方法名是Push，这是一个典型的通知模式，可以给出额外日志
        if (methodName === 'Push') {
          console.log(`检测到通知(Push)模式，类型名: ${typeName}`);
        }
      }
    }

    console.log(`协议类型: ${resType}`);
    console.log(`包名: ${packageName}`);
    console.log(`方法名: ${methodName}`);
    if (typeName) console.log(`解析的类型名: ${typeName}`);

    // 提取base64数据（冒号后的所有内容）
    const base64Data = processedStr.substring(colonIndex + 1).trim();
    console.log(`base64数据长度: ${base64Data.length}`);

    // 查找proto文件和类型名
    const protoInfo = findProtoFileByPackage(packageName, methodName, resType, typeName);

    if (!protoInfo) {
      throw new AppError(404, `未找到包 ${packageName} 方法 ${methodName} 的proto文件或类型`);
    }

    console.log(`找到proto文件: ${protoInfo.file}`);
    console.log(`确定的类型名: ${protoInfo.typeName}`);

    // 解析base64数据
    const jsonResult = await convertBase64ToJson(
      protoInfo.file,
      base64Data,
      protoInfo.typeName
    );

    // 使用统一响应格式返回结果
    return ResponseHelper.success(
      res,
      {
        timestamp, // 添加时间戳到返回结果
        packageName,
        methodName,
        resType,
        protoFile: protoInfo.file,
        typeName: protoInfo.typeName,
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
