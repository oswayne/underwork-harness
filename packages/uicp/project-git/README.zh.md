# uicp/project-git — 按用户的 Git 项目工作区

[English](README.md) | 中文

通过克隆 Git 仓库在服务器上创建标准模式项目工作区，落入调用者私有项目根
（`<projectsRoot>/users/<userId>/projects/<name>`）。私有仓库可携带用户名/密码，凭据经 dsh 凭据能力
（`$DSH_HOME/.credentials.yaml`，0600）保存，并经 askpass 助手注入 git——秘密不会出现在克隆 URL、argv 或日志中。

## 路由

| 方法 | 路径 | 行为 |
|---|---|---|
| `POST` | `/uicp/projects` | `{ repoUrl, name?, username?, password? }` + `Authorization: Bearer <JWT>`：把仓库克隆到用户项目根。无有效 Token 返回 401；URL/名称/body 非法返回 400；项目已存在返回 409。 |
| `GET` | `/uicp/projects` | 列出当前用户的项目。 |
| `POST` | `/uicp/projects/<name>/pull` | 用已存凭据在项目中执行 `git pull`。项目缺失或动作未知返回 404。 |

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `projectsRoot` | `$DSH_HOME/uicp-projects` | 存放 `users/<userId>/projects/<name>` 的根目录。 |
| `platformBase` | `https://api.underwork.cn/uicp` | JWT 校验的平台 API 基址。 |
| `selfPath` | `/user/user/self` | 返回当前用户的平台接口。 |

## 安全

- 凭据按"用户 + 项目"存为 dsh 凭据引用，克隆时解析；原始密码不会进入仓库 URL、git argv 或任何日志。
- askpass 助手是固定模板，从进程环境变量 `UWA_GIT_USER`/`UWA_GIT_PASS` 读取，0700 权限、单次克隆后即删除。
- 项目名按单一路径段校验；克隆失败会清理残留目录。
