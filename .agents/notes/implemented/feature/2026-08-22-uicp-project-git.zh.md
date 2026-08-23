# Agent Note: 按用户的 Git 项目工作区

Status: implemented

[English](2026-08-22-uicp-project-git.md) | 中文

## 问题

共享 SaaS 服务端上的标准模式用户无法把自己的代码带进工作区：此前的模型只知道服务端路径，对远程用户没有意义。团队确认：新建项目应填写 Git 仓库地址，私有仓库支持用户名/密码。

## 决定

`packages/uicp/project-git` 实现了"创建即克隆"的按用户标准模式项目：

- `POST /uicp/projects` 校验 JWT（复用 user-identity 解析器），可选用户名/密码经 dsh 凭据能力（`$DSH_HOME/.credentials.yaml`，0600）保存，并克隆到 `<projectsRoot>/users/<userId>/projects/<name>`；`GET /uicp/projects` 列出调用者项目。
- 凭据经固定 askpass 助手注入，脚本从进程环境变量 `UWA_GIT_USER`/`UWA_GIT_PASS` 读取，0700 权限、单次克隆后删除——秘密不会进入克隆 URL、argv 或日志。
- 项目名限定单一路径段；重复项目返回 409；克隆失败清理残留目录。
- git 执行器可注入（`internals.runGit`），单元测试无需真实仓库；默认实现调用系统 git。
- `POST /uicp/projects/<name>/pull` 复用已存凭据经 askpass 助手重新拉取；ui-uicp-nav 侧栏"新建项目"表单提交仓库地址与可选凭据，克隆成功后打开会话。

UWA 应用包仍由服务端默认创建，不走此 seam。M5 归属映射与侧栏过滤（P1）仍待实施。

## 备选方案

- **改用上传压缩包**——主路径拒绝：Git 是代码项目最自然的传输方式且携带版本历史；上传保留为后续选项。
- **把凭据写进克隆 URL 或项目本地 git 配置**——拒绝：两者都会把秘密写入持久文件；凭据能力 + askpass 将其隔离在仓库之外。

## 后果

共享服务器上的标准模式入门现在拥有凭据安全的克隆路径与按用户私有项目根，符合 M5 目录模型（应用包共享走归属映射，私有代码走按用户目录）。真实 git 执行器由本地仓库的单元测试覆盖；客户端表单与 pull 端点是下一步。
