# RedLogDecompress 使用说明

## 问题说明

当在Linux服务器上运行RedLogDecompress.py脚本时，可能会遇到以下错误：

```
OSError: /path/to/libshoco.so: invalid ELF header
```

这个错误的原因是libshoco.so文件是在Windows系统下编译的，而不是在Linux系统下编译的。Windows编译的库文件使用PE格式，而Linux使用ELF格式，两者不兼容。

## 解决方法

在Linux服务器上，需要重新编译libshoco.so文件：

1. 上传所有文件到Linux服务器
2. 给编译脚本添加执行权限：
   ```
   chmod +x compile_libshoco_linux.sh
   ```
3. 运行编译脚本：
   ```
   ./compile_libshoco_linux.sh
   ```
4. 脚本会在当前目录生成新的libshoco.so文件，替换原来的文件

## 注意事项

- 确保Linux服务器上安装了gcc编译器
- 如果遇到权限问题，可能需要使用sudo运行编译脚本
- 编译后的libshoco.so文件只能在相同或兼容的Linux系统上使用