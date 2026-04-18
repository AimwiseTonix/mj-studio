# MJ Studio 部署脚本
# 在 Git Bash 或 WSL 中执行

# 1. 进入目录
cd mj-studio-deploy

# 2. 设置远程仓库（如果还没设置）
git remote set-url origin https://github.com/AimwiseTonix/mj-studio.git

# 3. 提交代码（如果是首次，会提示输入GitHub用户名和Token）
git add .
git commit -m "MJ Studio - 赛博朋克风格星座生成器"

# 4. 推送到GitHub
# 注意：如果弹出认证窗口，输入你的GitHub用户名
# Personal Access Token (去 https://github.com/settings/tokens 生成)
git push -u origin main

# 5. 提示
echo ""
echo "========================================"
echo "代码已推送到 GitHub!"
echo ""
echo "接下来去 Vercel 部署："
echo "1. 访问 https://vercel.com"
echo "2. 用 GitHub 登录"
echo "3. 点 Add New Project"
echo "4. 导入 mj-studio 仓库"
echo "5. 在 Environment Variables 添加："
echo "   VITE_GEMINI_API_KEY = sk-2lbKWzNMpzhAFZaZf8JPJja80Se7xnmhReDSspNd6qDg8RV8"
echo "   VITE_MJ_API_KEY = sk-wvNm4l8QVJFPQ8XJC706B409701e4b788d2bD0E9150c7aC0"
echo "6. 点 Deploy!"
echo "========================================"
