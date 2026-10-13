# 给 agent 的说明:帮用户配置 make-chatgpt-agent

目标:让用户的 ChatGPT 网页端通过 MCP 读写其本机的代码仓库。组成:[devspace](https://github.com/Waishnav/devspace)(本机 MCP 服务,监听 127.0.0.1:7676)加 ngrok 固定域名隧道。完整步骤见 [README.md](README.md),本文件只写 agent 需要的分工、检查点和禁区。

## 先问用户的信息

1. 要开放给 ChatGPT 的项目目录(绝对路径)。越窄越好,不要接受 `~`、`/`、`C:\`。
2. 操作系统(macOS / Linux / Windows)。Windows 需要 Git Bash 或 WSL。
3. 是否用代理或 TUN(Clash 等)。这决定了下面的坑是否会遇到。

## 分工

**agent 可以做**

- 检查环境:`node --version`、`git --version`、`devspace --version`、`ngrok version`。
- 安装:`npm install -g @waishnav/devspace`;`brew install --cask ngrok`(Windows:`winget install ngrok.ngrok`)。
- 编辑 `~/.devspace/config.json`:写 `allowedRoots`,把 `subagents.enabled` 设为 `false`。改之前先备份,并告诉用户改了什么。
- 运行 `devspace doctor` 并核对 `Allowed roots`、`Allowed hosts`、`Subagents: disabled`。
- 用 `node scripts/agent.mjs start|stop` 启动和停止(见下)。
- 验证连通性。

**必须由用户自己做,agent 不要代劳**

- `ngrok config add-authtoken <token>`:token 是凭证,让用户在自己的终端执行,不要让用户把它贴给你。
- 在 ngrok 后台(https://dashboard.ngrok.com 的 Domains)领取免费固定域名,然后把域名告诉你。域名本身可以经手,token 不行。
- 在 ChatGPT 里添加 MCP 并授权(chatgpt.com/plugins → Add custom MCP server)。
- 在授权页输入 `ownerToken`。它在 `~/.devspace/auth.json`,让用户自己 `cat` 并粘贴。**不要读取、打印或转述这个文件的内容**,也不要写进任何文档或日志。
- 需要 sudo 的操作。

## 配置流程(摘要)

1. `devspace init`,场景选 ChatGPT。
2. 编辑 `~/.devspace/config.json`:`allowedRoots`、`subagents.enabled=false`(`allowedRoots` 为项目绝对路径数组,`subagents` 为 `{ "enabled": false }`)。
3. 安装 ngrok,用户自己配置 authtoken 并领取域名。
4. 启动:`NGROK_DOMAIN=<域名> node scripts/agent.mjs start`。脚本会设置 `publicBaseUrl`、启动 ngrok 和 devspace,并自检。
5. 验证(见下),然后告诉用户:Server URL 填 `https://<域名>/mcp`,认证选 OAuth,授权页输入 `ownerToken`。
6. 停止:`node scripts/agent.mjs stop`。

可选:帮用户把 `make-chatgpt-agent-start` / `make-chatgpt-agent-stop` 函数写进 shell 配置,模板见 README。改 `~/.zshrc` 等文件前先备份。

## 验证

| 检查 | 期望 |
| --- | --- |
| `curl -i http://127.0.0.1:7676/mcp` | HTTP 401 |
| `curl https://<域名>/.well-known/oauth-protected-resource/mcp` | 返回含 `"resource_name":"DevSpace"` 的 JSON(不带 `/mcp` 后缀的路径是 404,属正常) |
| 海外节点访问上一条(check-host.net) | HTTP 200 |

浏览器直接打开 `/mcp` 是空白页,正常。本机自测在代理环境下可能失真,公网可达性以海外节点为准。

## 已知的坑

- **`ERR_NGROK_9009`**:ngrok 免费版不允许走 HTTP 代理,环境里有 `http_proxy` 等变量就会报错。`scripts/agent.mjs` 已在启动时去掉;手动启动 ngrok 时要自己 `env -u`。
- **`allowedRoots` 回退到启动目录**:配置里没写时,devspace 使用启动时的当前目录。必须写明。
- **ChatGPT 报"无法发现 OAuth 设置"**:先确认公网 URL 能返回上面的 JSON,再确认 `publicBaseUrl` 与域名一致(不带 `/mcp`),`doctor` 的 Allowed hosts 含该域名。
- **Tailscale Funnel 在国内网络下不可用**(实测,原因未查明),不要推荐。Cloudflare 隧道未验证。
- **配置文件格式随版本不同**:devspace 1.0.8 是扁平的 `~/.devspace/config.json`。改之前先 `devspace config get`,以实际版本为准。
- 服务重启后会话失效,让 ChatGPT 重新 `open_workspace` 即可。

## 安全规则

- devspace 的 shell **不受路径限制**,能做用户账户能做的一切;`allowedRoots` 只约束文件工具。把这点明确告诉用户,建议用低权限系统用户、虚拟机或不含敏感数据的机器运行。
- 启动脚本会让用户的本机服务对公网开放。执行 `start` 前,确认用户知情并同意;用户不用时帮其执行 `stop`。
- 修改用户的配置文件(`~/.devspace/config.json`、shell 配置)前先备份并说明。
- 不要提交 `~/.devspace/auth.json`、ownerToken、ngrok authtoken 到任何仓库。
- 无法在用户环境里核实的内容,明确说"未验证",不要当作事实写进文档。
