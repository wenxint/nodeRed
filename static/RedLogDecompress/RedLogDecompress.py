#!/usr/bin/env python3.7
# -*- coding: utf-8 -*-
# 导入所需的库
import ctypes       # 用于调用动态链接库
import os           # 用于文件路径操作
import sys          # 用于获取命令行参数
import io           # 提供流式I/O支持
import base64       # 用于base64编码和解码
import re           # 用于正则表达式匹配
import platform     # 用于检测操作系统类型

def add_prefix_to_filename(path, prefix):
    """
    向文件名添加前缀或后缀

    参数:
        path: 原始文件路径
        prefix: 要添加的前缀或后缀

    返回:
        添加了前缀或后缀的新文件路径
    """
    dir_name, file_name = os.path.split(path)                # 分离目录和文件名
    file_base, file_ext = os.path.splitext(file_name)        # 分离文件名和扩展名
    new_file_name = f"{file_base}{prefix}{file_ext}"         # 构建新的文件名
    new_path = os.path.join(dir_name, new_file_name)         # 组合成完整路径
    return new_path

if __name__ == '__main__':
    # 获取命令行参数中的日志文件路径
    logpath = sys.argv[1]
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # 检测操作系统并加载相应的库文件
    if platform.system() == 'Windows':
        lib_filename = 'libshoco.dll'                        # Windows系统使用dll文件
    else:  # Linux或其他类Unix系统
        lib_filename = 'libshoco.so'                         # Linux系统使用so文件

    # 构建库文件的完整路径
    dllpath = os.path.join(script_dir, lib_filename)
    # 创建解压后文件的路径，文件名添加"Decompressed"后缀
    new_path = add_prefix_to_filename(logpath, "Decompressed")

    try:
        # 加载动态链接库
        shoco = ctypes.CDLL(dllpath)
        # 设置shoco_decompress函数的参数类型和返回值类型
        shoco.shoco_decompress.argtypes = [ctypes.POINTER(ctypes.c_char), ctypes.c_int, ctypes.POINTER(ctypes.c_char), ctypes.c_int]
        shoco.shoco_decompress.restype = ctypes.c_int
    except Exception as e:
        # 如果无法加载库文件，打印错误信息并退出
        print(f"无法加载库文件 {lib_filename}: {str(e)}")
        sys.exit(1)

    readbytes = None

    try:
        # 首先尝试以文本模式打开文件
        with open(logpath, 'r') as fileR:
            s = fileR.read()
            # 检查内容是否符合base64编码格式
            if re.match(r'^[A-Za-z0-9+/]*={0,2}$', s) or len(s) % 4 != 0:
                # 如果是base64编码，则解码并跳过前3个字节
                readbytes = base64.b64decode(s)[3:]
    except Exception as e:
        # 如果以文本模式读取失败，则尝试以二进制模式打开
        with open(logpath, 'rb') as fileR:
            # 读取二进制内容并跳过前3个字节
            readbytes = fileR.read()[3:]

    # 如果成功读取到数据
    if (readbytes):
        # 打开新文件准备写入解压数据
        with open(new_path, 'wb') as fileW:
            # 创建足够大的缓冲区用于存储解压后的数据
            buffer = ctypes.create_string_buffer(len(readbytes) * 2)
            # 调用shoco库的解压函数
            decompressSize = shoco.shoco_decompress(readbytes, len(readbytes), buffer, len(readbytes) * 2)
            # 打印压缩前后的大小信息
            print("CompressSize:"+str(len(readbytes))+ ",DecompressSize:" + str(decompressSize))
            # 将解压后的数据写入新文件
            fileW.write(buffer.value)