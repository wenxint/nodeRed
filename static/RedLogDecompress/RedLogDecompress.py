#!/usr/bin/env python3.7
# -*- coding: utf-8 -*-
import ctypes
import os
import sys
import io
import base64
import re
import platform

def add_prefix_to_filename(path, prefix):
    dir_name, file_name = os.path.split(path)
    file_base, file_ext = os.path.splitext(file_name)
    new_file_name = f"{file_base}{prefix}{file_ext}"
    new_path = os.path.join(dir_name, new_file_name)
    return new_path

if __name__ == '__main__':
    logpath = sys.argv[1]
    # 根据操作系统选择正确的库文件
    if sys.platform == 'win32':
        lib_name = 'libshoco.dll'
    else:
        lib_name = 'libshoco.so'

    dllpath = os.path.join(os.path.dirname(os.path.abspath(__file__)), lib_name)
    new_path = add_prefix_to_filename(logpath, "Decompressed")

    # 检查库文件是否存在
    if not os.path.exists(dllpath):
        print(f"错误: 找不到库文件 {dllpath}")
        sys.stdout.flush()
        sys.exit(1)

    try:
        shoco = ctypes.CDLL(dllpath)
    except Exception as e:
        print(f"错误: 加载库文件失败: {e}")
        print(f"当前系统: {platform.system()} {platform.machine()}")
        print("如果在Linux系统上，请运行compile_libshoco_linux.sh脚本重新编译库文件")
        sys.stdout.flush()
        sys.exit(1)
    shoco.shoco_decompress.argtypes = [ctypes.POINTER(ctypes.c_char), ctypes.c_int, ctypes.POINTER(ctypes.c_char), ctypes.c_int]
    shoco.shoco_decompress.restype = ctypes.c_int

    readbytes = None

    try:
        with open(logpath, 'r') as fileR:
            s = fileR.read()
            if re.match(r'^[A-Za-z0-9+/]*={0,2}$', s) or len(s) % 4 != 0:
                readbytes = base64.b64decode(s)[3:]
    except Exception as e:
        with open(logpath, 'rb') as fileR:
            readbytes = fileR.read()[3:]
    if (readbytes):
        with open(new_path, 'wb') as fileW:
            buffer = ctypes.create_string_buffer(len(readbytes) * 2)
            decompressSize = shoco.shoco_decompress(readbytes, len(readbytes), buffer, len(readbytes) * 2)
            print("CompressSize:"+str(len(readbytes))+ ",DecompressSize:" + str(decompressSize))
            sys.stdout.flush()
            fileW.write(buffer.value)