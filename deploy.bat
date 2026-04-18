@echo off
echo ================================
echo MJ Studio 部署脚本
echo ================================
echo.

cd /d "%~dp0"

echo [1/3] 提交代码...
git add .
git commit -m "MJ Studio v1.0"

echo.
echo [2/3] 推送到 GitHub...
echo 需要认证！弹出窗口时输入你的 GitHub 用户名和 Personal Access Token
echo.
git push -u origin main

echo.
echo [3/3] 完成！
echo.
echo ========================================
echo 下一步：
echo 1. 访问 https://vercel.com
echo 2. 用 GitHub 登录
echo 3. 点 Add New Project
echo 4. 导入 mj-studio 仓库
echo 5. 添加环境变量：
echo    VITE_GEMINI_API_KEY = sk-2lbKWzNMpzhAFZaZf8JPJja80Se7xnmhReDSspNd6qDg8RV8
echo    VITE_MJ_API_KEY = sk-wvNm4l8QVJFPQ8XJC706B409701e4b788d2bD0E9150c7aC0
echo 6. Deploy!
echo ========================================
pause
