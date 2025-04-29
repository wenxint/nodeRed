@echo off

::说明：
::在Proto目录中本地创建一个include文件夹，注意将其标记为ignore on commit（如果希望采用其他路径，可以修改下面的Proto\include参数）
::在文件夹中创建include-branch.txt文件，将branch替换为希望使用的协议分支名（例如master分支对应的include文件为include-master.txt）（如果希望采用其他前缀，可以修改下面的include参数）
::在include文件中，【逐行】填写希望拷贝到Proto目录下的.proto文件路径。路径应为Proto\的相对路径，例如pkg\proto\guildpb\api.proto，分割号不可使用正斜杠“/”
::完成后，运行本脚本，在询问分支名时输入，本脚本即会读取对应的include文件，拉取后台协议分支到临时文件夹，并复制指定的.proto文件到对应的目标目录
::由于复制为单文件覆盖，因此正式提交时应当注意主干上是否有其他人对相同的.proto文件做了修改
cd ../../../../../Plugins/AutomationTools\Content\Python\ProtoCheckout
call ProtoCheckoutCustom.bat Proto\include include ::DON'T use / in the include.txt file!