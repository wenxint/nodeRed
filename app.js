var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
var app = express();

app.use(
  cors({
    origin: "*",
    credentials: false,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-request-id",
      "Accept",
      "Origin",
      "X-Requested-With",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
      "sign",
      "uid",
      "client-ip",
      "currenttime",
      "phone-brand",
      "device-id",
      "token",
      "Proxy-Authorization",
    ],
  })
);
var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var deepseekRouter = require("./routes/deepseek");
// var proto = require("./routes/redApi/proto");
// var RedLogDecompress = require("./routes/redApi/RedLogDecompress");

if (process.env.NODE_ENV === "production") {
  console.log("Running in production mode");
} else {
  console.log("Running in development mode");
}
// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(logger("dev"));
// app.use(logger("combined", {
//   skip: function (req, res) { return true }
// }));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use("/static", express.static(path.join(__dirname, "static")));

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/deepseek", deepseekRouter);
// app.use("/myapi", proto);
// app.use("/myapi", RedLogDecompress);

// catch 404 and forward to error handler
// 自动引入 redApi 文件夹下的路由
const fs = require("fs");
const redApiPath = path.join(__dirname, "routes", "redApi");
const redApiRoutes = fs
  .readdirSync(redApiPath)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({
    name: file.replace(".js", ""),
    router: require(path.join(redApiPath, file)),
  }));

// 注册所有 redApi 路由
redApiRoutes.forEach((route) => {
  app.use("/myapi", route.router);
});

/**
 * @description 在应用启动时从 SVN 导出 Proto 文件夹内容到本地Proto目录
 * @see http://tc-svn.tencent.com/KungfuTeam/Red_proj/trunk/RedApp/Content/Script/Red/Net/Proto
 */
const { execSync } = require("child_process");
const protoSVNRepo = 'http://tc-svn.tencent.com/KungfuTeam/Red_proj/trunk/RedApp/Content/Script/Red/Net/Proto';
const protoDir = path.join(__dirname, "Proto");

// 检查svn命令是否可用
let svnAvailable = true;
try {
  execSync("svn --version", { stdio: "ignore" });
} catch (err) {
  svnAvailable = false;
}
if (!svnAvailable) {
  console.warn("未检测到svn命令，跳过Proto文件夹导出");
} else {
  try {
    // 确保本地Proto目录存在
    if (!fs.existsSync(protoDir)) {
      fs.mkdirSync(protoDir, { recursive: true });
    }
    console.info("SVN导出Proto文件...");
    execSync(
      `svn export --force "${protoSVNRepo}" "${protoDir}" --username a1_red --password A1Red@dev --no-auth-cache --non-interactive --trust-server-cert`,
      { stdio: "inherit" }
    );
  } catch (error) {
    console.error("Proto文件导出失败:", error);
  }
}

app.use(function (req, res, next) {
  next(createError(404));
});

// 导入错误处理中间件
const { errorHandler } = require("./middleware/errorHandler");

// 使用全局错误处理中间件
app.use(errorHandler);

module.exports = app;
