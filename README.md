# 星港余烬 · SpaceBase

一款太空站生存文字游戏，灵感来自《这是我的战争》。

在封锁的轨道站中管理资源、做出道德抉择、派遣搜刮任务，带领幸存者撑到救援抵达。

## 在线游玩

**https://jk9988610.github.io/SpaceBase/**

## 本地运行

直接用浏览器打开 `index.html` 即可，无需构建步骤。

```bash
# 或使用简易 HTTP 服务
python3 -m http.server 8080
# 访问 http://localhost:8080
```

## GitHub Pages 部署（Actions 模式）

本仓库已配置 GitHub Actions 自动部署。在仓库设置中：

1. 进入 **Settings → Pages**
2. **Build and deployment** → Source 选择 **GitHub Actions**
3. 推送至 `main` 分支后，工作流 `.github/workflows/deploy-pages.yml` 会自动构建并发布

## 玩法简介

- **白昼**：修缮、配给、治疗、发送救援信号（每日最多 3 项行动）
- **夜晚**：派遣幸存者搜刮货运舱、医疗舱、反应堆区等危险区域
- **资源**：氧气、食物、净水、药品、废料——任何一项耗尽都可能导致灭团
- **胜利**：累计发送 3 次救援信号并坚持到救援抵达
- **失败**：全员阵亡或氧气耗尽
