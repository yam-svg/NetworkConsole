@echo off
echo 启动 Edge 插件开发环境...
echo.
echo 请注意：
echo 1. 构建完成后，请使用 dist 文件夹加载到 Edge 浏览器
echo 2. 每次修改代码后需要重新构建
echo 3. 开发时建议使用 npm run dev 进行热重载开发
echo.

echo 正在构建插件...
npm run build

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ 构建成功！
    echo.
    echo 📁 请将 dist 文件夹加载到 Edge 浏览器：
    echo    1. 打开 Edge 浏览器
    echo    2. 访问 edge://extensions/
    echo    3. 开启"开发人员模式"
    echo    4. 点击"加载解压缩的扩展"
    echo    5. 选择项目的 dist 文件夹
    echo.
    echo 🚀 开发模式：运行 npm run dev 进行热重载开发
    echo.
) else (
    echo.
    echo ❌ 构建失败，请检查错误信息
)

pause