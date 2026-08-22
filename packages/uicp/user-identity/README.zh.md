# uicp/user-identity — 平台用户身份 seam

[English](README.md) | 中文

用平台 JWT 调平台自检接口（`/user/user/self`）校验身份，按凭据缓存结果，并把用户记录持久化到追加式 JSONL，供后续界面展示用户信息而无需重复校验。缓存以凭据哈希为键；原始 Token 不进入存储与日志。

## 路由

| 方法 | 路径 | 行为 |
|---|---|---|
| `GET` | `/uicp/user/me` | 用 `Authorization: Bearer <JWT>` 解析平台用户并返回 `{ status: 0, data: { user } }`；Token 缺失或被平台拒绝时返回 401。 |

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `platformBase` | `https://api.underwork.cn/uicp` | 自检请求的平台 API 基址。 |
| `selfPath` | `/user/user/self` | 返回当前用户的平台接口。 |
| `usersFile` | `$DSH_HOME/uicp-users/users.jsonl` | 保存用户记录的追加式 JSONL。 |
| `cacheTtlMs` | `300000` | 校验通过后信任该凭据的时长。 |

## 存储

每行一条 JSON 记录：`{ userId, name?, profile, seenAt }`，读取时同一用户以最后写入为准。文件超过 512 行时自动压缩，只保留每个用户的最新记录。`profile` 保留平台自检的原始载荷，后续展示演进无需迁移。
