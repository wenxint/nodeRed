#!/usr/bin/env python3.7
# -*- coding: utf-8 -*-
import ctypes
import os
import sys
import io
import base64
import re 

def add_prefix_to_filename(path, prefix):
    dir_name, file_name = os.path.split(path)
    file_base, file_ext = os.path.splitext(file_name)
    new_file_name = f"{file_base}{prefix}{file_ext}"
    new_path = os.path.join(dir_name, new_file_name)
    return new_path
    
if __name__ == '__main__':
    logpath = sys.argv[1]
    dllpath = os.path.dirname(os.path.abspath(__file__)) + '/libshoco.dll'
    new_path = add_prefix_to_filename(logpath, "Decompressed") 
 
    shoco = ctypes.CDLL(dllpath)
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
            fileW.write(buffer.value)