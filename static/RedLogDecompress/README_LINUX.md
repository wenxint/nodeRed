# RedLogDecompress Linux 使用指南

## 问题说明

在Linux服务器上运行RedLogDecompress.py脚本时，如果遇到以下错误：

```
错误: Wine执行失败 - Wine环境中没有安装Python
```

这是因为脚本尝试使用Wine来加载Windows的DLL文件，但Wine环境中没有安装Python解释器。

## 解决方法

最佳解决方案是在Linux服务器上直接编译libshoco.so文件，这样就不需要依赖Wine环境。请按照以下步骤操作：

### 1. 准备工作

确保Linux服务器上已安装以下软件：
- Python 3.x
- GCC编译器
- 基本开发工具包

可以使用以下命令安装必要的软件包：

```bash
# 对于Debian/Ubuntu系统
sudo apt-get update
sudo apt-get install -y python3 python3-dev gcc build-essential

# 对于CentOS/RHEL系统
sudo yum install -y python3 python3-devel gcc
```

### 2. 编译libshoco.so文件

1. 将整个RedLogDecompress目录上传到Linux服务器

2. 进入RedLogDecompress目录：
   ```bash
   cd /path/to/RedLogDecompress
   ```

3. 给编译脚本添加执行权限：
   ```bash
   chmod +x compile_libshoco_linux.sh
   ```

4. 运行编译脚本：
   ```bash
   ./compile_libshoco_linux.sh
   ```

5. 脚本会在当前目录生成新的libshoco.so文件，替换原来的文件

### 3. 运行RedLogDecompress.py

编译完成后，直接运行Python脚本：

```bash
python3 RedLogDecompress.py 你的日志文件路径
```

## 注意事项

- 确保Linux服务器上安装了gcc编译器
- 如果遇到权限问题，可能需要使用sudo运行编译脚本
- 编译后的libshoco.so文件只能在相同或兼容的Linux系统上使用
- 脚本已经更新，会优先使用本地编译的libshoco.so文件，不再依赖Wine环境

## 故障排除

如果编译过程中遇到问题，请检查：

1. 是否有完整的shoco目录及其源代码文件
2. 编译器是否正确安装
3. 是否有足够的权限执行编译脚本

如果运行脚本时仍然遇到问题，可以查看脚本输出的详细日志信息，以确定具体的错误原因。