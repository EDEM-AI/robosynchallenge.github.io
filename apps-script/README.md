# RoboSynChallenge Apps Script 后端部署手册

这个目录是 `robosyn-bench.net` 静态网站使用的 Google Apps Script 后端模板。网站本身仍然部署在 GitHub Pages；所有敏感状态，包括 access token、登录 session、提交记录、评测记录和 leaderboard 发布状态，都存放在私有 Google Sheet、Gmail 和 Apps Script Properties 里。

本文以如下账号配置为例：

- 组织者主邮箱：`robosynchallenge@gmail.com`
- 管理者通知邮箱：`781785786@qq.com`

关键原则：Apps Script Web App 会以部署者身份执行，所以请尽量用 `robosynchallenge@gmail.com` 创建 Sheet、Apps Script、Gmail label 和 Web App 部署。`781785786@qq.com` 在这个例子里是管理员 digest 收件人，不等于 Gmail label 审核发生在这个邮箱里。

## 需要准备的信息

部署前先准备这些值：

```text
SPREADSHEET_ID=1fXT5BuNgMYKyYuWNQ1FvIVG0Hfl3NFQ3p8a1BS5v_Ec
ADMIN_EMAILS=781785786@qq.com
APPROVED_LABEL=RSC Approved
REJECTED_LABEL=RSC Rejected
REQUESTED_LABEL=RSC Requested
PROCESSED_LABEL=RSC Processed
EVAL_DONE_LABEL=RSC Eval Done
EVAL_NOT_DONE_LABEL=RSC Eval Not Done
CONTACT_EMAIL=robosynchallenge@gmail.com
WEB_APP_URL=https://script.google.com/macros/s/AKfycbwg9Ee-ZK9eNiMeJGsjzjxF8D6TFMlcuqclrHrVi8-AKHHhP_rYk-FVLZ-3lRSWs-HIXQ/exec
WECHAT_QR_FILE_ID=<可选，内部微信群二维码图片的 Google Drive file id>
SITE_LOGIN_URL=https://robosyn-bench.net/#/login
DISCORD_INVITE_URL=https://discord.gg/3DfJu5HTS
API_BASE_URL=https://script.google.com/macros/s/AKfycbwg9Ee-ZK9eNiMeJGsjzjxF8D6TFMlcuqclrHrVi8-AKHHhP_rYk-FVLZ-3lRSWs-HIXQ/exec
```

如果管理员有多个收件人，`ADMIN_EMAILS` 用英文逗号分隔，例如：

```text
ADMIN_EMAILS=781785786@qq.com,another-admin@example.com
```

## 创建私有 Google Sheet

1. 用浏览器登录 `robosynchallenge@gmail.com`。
2. 打开 Google Drive。
3. 点击 **New** / **新建**。
4. 选择 **Google Sheets**。
5. 建议命名为 `RoboSynChallenge Backend`。
6. 不要公开分享这个 Sheet。它会保存完整邮箱、access token、提交记录和评测记录。
7. 从浏览器地址栏复制 Sheet ID。

Google Sheet URL 形如：

```text
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit#gid=0
```

其中 `/d/` 和 `/edit` 中间这一段就是 `SPREADSHEET_ID`：

```text
SPREADSHEET_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

## 创建 Apps Script 项目

1. 在刚创建的 Google Sheet 页面里，点击顶部菜单 **Extensions** / **扩展程序**。
2. 点击 **Apps Script**。
3. 删除默认生成的代码。
4. 把本仓库里的 `apps-script/Code.gs` 全部复制进去。
5. 如果 Apps Script 编辑器左侧能看到 `appsscript.json` manifest 文件，就把本仓库里的 `apps-script/appsscript.json` 内容也复制进去。
6. 保存项目，建议项目名也叫 `RoboSynChallenge Backend`。

如果编辑器默认不显示 manifest：

1. 打开 Apps Script 左侧 **Project Settings** / **项目设置**。
2. 勾选 **Show "appsscript.json" manifest file in editor**。
3. 回到编辑器左侧，打开 `appsscript.json` 并粘贴本仓库对应内容。

## 设置 Script Properties

Script Properties 是后端私有配置，应该写在 Apps Script 项目里，不要写进网站前端代码。

操作路径：

1. 打开 Apps Script 项目。
2. 左侧点击齿轮图标 **Project Settings** / **项目设置**。
3. 找到 **Script Properties**。
4. 点击 **Add script property** / **添加脚本属性**。
5. 逐项添加下面这些 key 和 value。

推荐示例：

```text
Property: SPREADSHEET_ID
Value: <你的 Google Sheet ID>

Property: ADMIN_EMAILS
Value: 781785786@qq.com

Property: APPROVED_LABEL
Value: RSC Approved

Property: REJECTED_LABEL
Value: RSC Rejected

Property: REQUESTED_LABEL
Value: RSC Requested

Property: PROCESSED_LABEL
Value: RSC Processed

Property: EVAL_DONE_LABEL
Value: RSC Eval Done

Property: EVAL_NOT_DONE_LABEL
Value: RSC Eval Not Done

Property: CONTACT_EMAIL
Value: robosynchallenge@gmail.com

Property: WEB_APP_URL
Value: https://script.google.com/macros/s/AKfycbwg9Ee-ZK9eNiMeJGsjzjxF8D6TFMlcuqclrHrVi8-AKHHhP_rYk-FVLZ-3lRSWs-HIXQ/exec

Property: WECHAT_QR_FILE_ID
Value: <微信群二维码图片的 Google Drive file id>

Property: SITE_LOGIN_URL
Value: https://robosyn-bench.net/#/login

Property: DISCORD_INVITE_URL
Value: https://discord.gg/3DfJu5HTS
```

说明：

- `SPREADSHEET_ID`：从 Google Sheet URL 里复制，不能填整个 URL。
- `ADMIN_EMAILS`：收到中文管理汇总邮件和 XLSX 附件的管理员邮箱列表。
- `APPROVED_LABEL`：审核通过时给 Gmail thread 打的 label 名。
- `REJECTED_LABEL`：审核拒绝时给 Gmail thread 打的 label 名。
- `REQUESTED_LABEL`：尚未完成回应的注册申请队列 label。默认是 `RSC Requested`；如果你确实想拼成 `RCS requested`，就在这里改。
- `PROCESSED_LABEL`：脚本处理完 thread 后自动打的 label 名，避免重复处理。
- `EVAL_DONE_LABEL`：评测完成时给 evaluation request 邮件 thread 打的 label 名。
- `EVAL_NOT_DONE_LABEL`：评测无法完成时给 evaluation request 邮件 thread 打的 label 名。
- `CONTACT_EMAIL`：组织者邮箱，当前应为 `robosynchallenge@gmail.com`。
- `WEB_APP_URL`：当前 Apps Script Web App URL。注册审核邮件里的 Approve / Deny 按钮需要它。
- `WECHAT_QR_FILE_ID`：可选。审批通过邮件会把这个 Google Drive 图片文件作为内部微信群二维码直接显示在邮件正文中。
- `SITE_LOGIN_URL`：可选。approval / token reminder 邮件里的登录测试链接；默认是 `https://robosyn-bench.net/#/login`。
- `DISCORD_INVITE_URL`：可选。approval / token reminder / token regenerated 邮件里的 Discord 邀请链接；默认是 `https://discord.gg/3DfJu5HTS`。

## 初始化 Sheet 和 Gmail Labels

1. 在 Apps Script 顶部函数下拉框选择 `initializeSheets`。
2. 点击 **Run** / **运行**。
3. 第一次运行会要求授权。
4. 授权时确认账号是 `robosynchallenge@gmail.com`。当前 manifest 需要完整 Google Drive scope，用于创建临时 spreadsheet、导出精简 XLSX、再把临时文件移入 trash。
5. 授权完成后，脚本会在 Sheet 里创建这些 tabs：

```text
AccessRequests
Users
Sessions
Submissions
Evaluations
FullNameUpdates
DigestLog
Errors
```

同时也会在 `robosynchallenge@gmail.com` 的 Gmail 里创建这些 labels：

```text
RSC Approved
RSC Rejected
RSC Requested
RSC Processed
RSC Eval Done
RSC Eval Not Done
```

如果你改了 Script Properties 里的 label 名，创建出来的 label 名也会跟着改。

## 上传内部微信群二维码

如果希望审批通过邮件自动附上微信群二维码：

1. 用 `robosynchallenge@gmail.com` 登录 Google Drive。
2. 上传微信群二维码截图，建议文件名为 `RoboSynChallenge-WeChat-QR.png`。
3. 打开图片文件。
4. 从 URL 里复制 file id。

Google Drive 文件 URL 通常形如：

```text
https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view
```

其中 `/d/` 和 `/view` 中间这一段就是 `WECHAT_QR_FILE_ID`：

```text
WECHAT_QR_FILE_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz
```

5. 把这个值写进 Apps Script 的 Script Properties。

这个图片不需要公开分享；只要 Apps Script 部署账号 `robosynchallenge@gmail.com` 能访问即可。审批通过邮件会把二维码直接显示在邮件正文中，并提醒参赛者不要转发或分享。

## 安装自动触发器

1. 在 Apps Script 顶部函数下拉框选择 `installBackendTriggers`。
2. 点击 **Run** / **运行**。
3. 它会安装两个触发器：

- 每 3 小时运行一次 `processLabeledRequests`，处理 Gmail 审核 label。
- Sheet 被编辑时运行 `onSheetEdit`，发送中文 digest，并在 `Users.token_action` 被编辑时立即处理 revoke/regenerate。

如果只想手动处理，也可以不安装触发器，每次在 Apps Script 里手动运行 `processLabeledRequests`。

## 管理员 digest 附件

正常的中文管理汇总邮件会附带一个精简 XLSX，不再导出完整后端 workbook。精简附件只包含两张表：

```text
AccessTokens
Evaluations
```

- `AccessTokens`：一行代表一次 access request，包含申请、审核、通知状态，并合并同邮箱当前 `Users` token 生命周期信息。
- `Evaluations`：一行代表一次 evaluation，包含 pending、not done、completed、published 等所有评测记录，并合并对应 policy submission 信息。

精简附件仍包含完整邮箱和明文 access token，必须按敏感材料处理。完整原始 workbook 只会在运行 `Reset test data` 前作为备份发送给管理员。

## 部署 Web App

1. 打开 Apps Script 项目。
2. 点击右上角 **Deploy** / **部署**。
3. 选择 **New deployment** / **新建部署**。
4. 类型选择 **Web app**。
5. 设置：

```text
Execute as: Me
Who has access: Anyone
```

6. 点击部署并授权。
7. 复制部署生成的 Web App URL。

Web App URL 形如：

```text
https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
```

这个 URL 需要填到网站的 `static/config.js`：

```js
window.ROBO_SYN_CONFIG = {
  API_BASE_URL: "https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec",
  CONTACT_EMAIL: "robosynchallenge@gmail.com",
};
```

`API_BASE_URL` 是公开 API URL，不是 secret；真正敏感的 Sheet ID、管理员邮箱、token 都只放在 Apps Script Properties 和私有 Sheet 里。

## API Actions

网站前端会向 `API_BASE_URL` 发送 JSON POST 请求。当前支持这些 action：

```text
health
request_access
login
my_submissions
submit_policy
leaderboard
update_full_name
```

其中 `request_access` 的 payload 是：

```text
request_id
email
full_name
team_name
affiliation
intended_use
misc
```

`full_name` 是参赛队伍成员名单，必须使用英文逗号 `,` 分隔，最多 5 个名字，不能有空项。审批通过后这项视为最终记录；已获批用户只能通过后端生成的一次性 full name update 链接在有效期内修改一次。

## 参赛者申请流程

1. 参赛者打开网站 `#/register`。
2. 在网页表单里填写：

```text
email
full_name
team_name
affiliation
intended_use
misc（可选）
```

`full_name` 填写规则：

- 用英文逗号 `,` 分隔所有参赛成员姓名，例如 `Alice Zhang, Bob Li`。
- 最多 5 个成员。
- 不允许空项，例如 `Alice, , Bob` 会被拒绝。
- 该字段在注册后不可随意更改；获批旧用户只有一次两周有效的更新链接。

3. 点击 **Send request**。
4. 网站会把表单提交到 Apps Script Web App。
5. Apps Script 会写入 `AccessRequests` tab，并给 `robosynchallenge@gmail.com` 发送一封审核邮件。
6. 审核邮件 subject 和正文都会包含 `request_id`，例如：

```text
RSC-REQ-2026-ABC123
```

7. 审核邮件正文会包含这些字段：

```text
request_id: RSC-REQ-2026-ABC123
email: participant@example.com
full_name: Alice Zhang, Bob Li
team_name: Team Name
affiliation: University or Company
intended_use: Brief intended use
misc: Optional extra information
```

后端会严格检查字段。缺少 `email`、`full_name`、`team_name`、`affiliation` 或 `intended_use`，或者 `full_name` 不符合英文逗号分隔、最多 5 人、无空项规则时，不会进入审核流程，会在网页上返回错误，并在 `Errors` tab 里记录异常。

### Full name 更新流程

旧的 approved 用户需要确认 `full_name` 时，管理员可在后端 Sheet 菜单运行：

- `Send full name update test`：只发给 `224040356@link.cuhk.edu.cn` 做测试。
- `Send full name update invites`：发给所有 `Users.token_status=active` 的用户。

脚本会在 `FullNameUpdates` tab 中记录每个邮箱的一次性 token、邀请发送状态、两周截止日期、是否完成、提交的新 `full_name`。参赛者点击邮件中的链接后，只能提交 `full_name` 一个字段；成功后脚本只更新同邮箱的 `Users.full_name` 和 `AccessRequests.full_name`，其他后端字段不受影响。链接过期或已提交后不能再次使用。

## 审核者审批流程

审核动作发生在 `robosynchallenge@gmail.com` 的 Gmail mailbox 里。审核者需要能登录这个邮箱，或使用这个邮箱的 Gmail delegation。

### 通过申请

1. 在 `robosynchallenge@gmail.com` Gmail 中打开参赛者申请邮件 thread。
2. 确认正文里的必填字段完整且可信。
3. 点击邮件中的 **Approve** 按钮。
4. Apps Script 会把这条申请标成 `approved_pending_notification`，生成一个 `pending` token，并创建一封 Gmail draft。
5. 页面会先显示 request 信息，然后显示可编辑邮件草稿。
6. 页面底部有 **Open Gmail Drafts** 和 **Send now** 两个按钮：前者打开 Gmail 草稿箱查看已准备的 draft，后者发送当前页面中编辑好的邮件正文。
7. 如果 30 分钟内没有通过页面发送，后台触发器会自动发送默认 approval 模板。
8. 通知真正发送成功后，脚本才会把 token 写入 `Users` 并激活登录，同时发送中文 digest + 精简 XLSX。
9. 默认 approval 邮件包含 access token、登录测试链接和 Discord 邀请链接；如果配置了 `WECHAT_QR_FILE_ID`，还会在邮件正文中直接显示内部微信群二维码，并提醒不要转发。

也可以继续用 Gmail label 作为 fallback：给原始申请邮件 thread 打 label `RSC Approved`。这种情况下也会进入 30 分钟 pending；若无人手动发送，后台会发送默认 approval 模板。

注意：如果你只在 Gmail 里打开 draft 并手动点击 Gmail 的发送按钮，Apps Script 不一定能可靠感知这封邮件已经发出，因此 Sheet 状态、label 和 digest 可能不会自动更新。推荐使用审批页面里的 **Send now**。

如果需要给参赛者附加说明，在同一个 Gmail 账号里创建一个 draft。draft 的 subject 必须包含同一个 `request_id`，例如：

```text
Extra note for RSC-REQ-2026-ABC123
```

draft 正文会作为审核者额外文字进入默认模板。draft 附件总大小不超过 10 MB 时会自动记录；超过 10 MB 请在正文里放 Google Drive 链接。

处理结果：

- `AccessRequests` tab 写入申请记录。
- `Users` tab 在通知发出后创建或更新用户。
- 生成强随机 access token；发送前只在 `AccessRequests` 中标记为 `pending`，发送后才变为 `active`。
- 参赛者收到 approval 邮件、token、登录测试链接、Discord 邀请链接，以及可选的邮件正文内嵌微信群二维码。
- `781785786@qq.com` 收到中文管理汇总邮件和精简 XLSX 附件。
- 原 Gmail thread 从 `RSC Requested` 移出，并打上 `RSC Approved` 和 `RSC Processed`。

### 拒绝申请

1. 在 `robosynchallenge@gmail.com` Gmail 中打开参赛者申请邮件 thread。
2. 点击邮件中的 **Deny** 按钮。
3. Apps Script 会把这条申请标成 `rejected_pending_notification`，并创建一封 Gmail draft。
4. 页面会先显示 request 信息，然后显示可编辑邮件草稿。
5. 页面底部有 **Open Gmail Drafts** 和 **Send now** 两个按钮：前者打开 Gmail 草稿箱查看已准备的 draft，后者发送当前页面中编辑好的邮件正文。
6. 如果 30 分钟内没有通过页面发送，后台触发器会自动发送默认 rejection 模板。
7. 通知真正发送成功后，脚本才会写最终 rejected 状态、更新 Gmail labels，并发送中文 digest + 精简 XLSX。

也可以继续用 Gmail label 作为 fallback：给原始申请邮件 thread 打 label `RSC Rejected`。

处理结果：

- `AccessRequests` tab 记录 rejected 状态。
- 参赛者收到 rejection 邮件。
- 管理员收到中文 digest 和精简 XLSX。
- 原 Gmail thread 从 `RSC Requested` 移出，并打上 `RSC Rejected` 和 `RSC Processed`。

### 待处理申请 label

新注册申请提交后，脚本会尽量把对应 Gmail thread 打上 `RSC Requested`。这个 label 表示“还没有给参赛者发送 approval/rejection 通知”。通知真正发出后，脚本会自动移除 `RSC Requested`，并加上 `RSC Approved` 或 `RSC Rejected`。

如果刚收到邮件时 label 没立刻出现，手动运行一次 `processLabeledRequests`，或等待 3 小时触发器同步即可。

### 重复申请同一邮箱

如果某个邮箱已经有 `active` token，再次在网站上提交注册申请时，脚本不会创建新的 token，也不会进入审批队列。它会直接把现有明文 token 发回这个邮箱，并给管理员发送中文 digest。

不要同时给同一个 thread 打 `RSC Approved` 和 `RSC Rejected`。如果误打了 label，先移除错误 label，再重新运行处理。

## 登录和提交流程

1. 参赛者收到 token 后，打开网站 `#/login`。
2. 用申请时填写的 `email` 和邮件里的 access token 登录。
3. 后端创建 24 小时有效的 `session_id`。
4. 参赛者在 `#/evaluation` 提交 policy artifact。
5. 提交字段包括：

```text
artifact_name
title
short_description
code_link
checkpoint_link
data_source_text
technical_notes
is_ranked
```

6. 每次提交会写入：

- `Submissions` tab：提交本身。
- `Evaluations` tab：一条 pending evaluation row。

7. Apps Script 会给 `robosynchallenge@gmail.com` 发送一封 evaluation request 邮件。
8. 参赛者会收到 submission received 邮件。
9. 管理员会收到中文 digest 和精简 XLSX。

## Evaluation 审核流程

Evaluation 审核不使用 Approve / Deny 按钮，也没有 30 分钟自动默认通知。它只使用 Gmail labels 和同 evaluation id 的 Gmail draft。

### Evaluation Done

1. 在 `robosynchallenge@gmail.com` Gmail 中打开 evaluation request 邮件 thread。
2. 复制邮件中的 `evaluation_id`，例如：

```text
eval_abc123def456
```

3. 在同一个 Gmail 账号里创建一个 draft。
4. draft subject 必须包含这个 `evaluation_id`。
5. draft body 必须包含下面四个字段：

```text
success_rate: 38.5
inference_time: 80.55
eval_time: 2026-07-15 19:30 CST
videos_link: https://drive.google.com/...
```

6. 给原始 evaluation request 邮件 thread 打 label：`RSC Eval Done`。
7. 等 10 分钟触发器自动处理，或在 Apps Script 手动运行 `processLabeledRequests`。

如果缺少 draft，或者 draft 里缺少 `success_rate`、`inference_time`、`eval_time`、`videos_link` 任一字段，后端不会发送结果邮件，会在 `Errors` tab 里记录错误。

处理结果：

- `Evaluations` tab 更新 `success_rate`、`inference_time`、`real_time`、`eval_time`、`videos_link`。
- `status` 更新为 `completed`。
- 参赛者收到 evaluation completed 邮件。
- 原 Gmail thread 被打上 `RSC Processed`，避免重复处理。

### Evaluation Not Done

1. 在 `robosynchallenge@gmail.com` Gmail 中打开 evaluation request 邮件 thread。
2. 如果需要说明原因，可以创建一个 subject 包含同一 `evaluation_id` 的 draft。
3. 给原始 evaluation request 邮件 thread 打 label：`RSC Eval Not Done`。
4. 等触发器自动处理，或手动运行 `processLabeledRequests`。

处理结果：

- `Evaluations.status` 更新为 `not_done`。
- 参赛者收到 evaluation update 邮件。
- 原 Gmail thread 被打上 `RSC Processed`。

## Sheet 管理操作

### Reset test data

用于上线前清空测试数据。它不会删除 Gmail labels、触发器或 Script Properties。

操作步骤：

1. 打开后端 Google Sheet。
2. 顶部菜单点击 **RoboSyn Backend**。
3. 点击 **Reset test data**。
4. 弹窗要求输入：

```text
RESET
```

5. 输入其他内容或取消时不会清空。
6. 输入 `RESET` 后，脚本会先给 `ADMIN_EMAILS` 发送一封完整原始 workbook 备份 XLSX。
7. 备份邮件发送成功后，脚本会清空这些 tabs 的数据行并保留表头：

```text
AccessRequests
Users
Sessions
Submissions
Evaluations
FullNameUpdates
```

8. `Errors` 和 `DigestLog` 会保留。
9. 脚本会删除测试阶段产生的 Gmail drafts：
   - 删除 `notification_draft_id` 对应的 draft。
   - 删除 subject 包含当前 `request_id` 或 `evaluation_id` 的 draft。
10. 清空完成后只弹窗提示，不再发送第二封确认邮件。

### 手动给某个邮箱发 token

推荐方式：使用 Apps Script 菜单函数随机生成 token 并自动填表。

1. 打开后端 Google Sheet。
2. 顶部菜单点击 **RoboSyn Backend**。
3. 点击 **Manual issue access token**。
4. 依次输入：
   - `Email`
   - `Full name`
   - `Team name`
   - `Affiliation`
   - `Intended use`
5. 脚本会检查这个邮箱是否已有 `active` token。
6. 如果没有，脚本会生成强随机 token，写入 `AccessRequests` 和 `Users`，并发送中文 digest + 精简 XLSX。
7. 弹窗里会显示明文 token。管理员可以手动复制到邮件里发给参赛者。

不推荐用 `email -> token` 的确定性计算方式。这样一旦算法或密钥泄漏，就可能批量伪造 token。当前安全做法是“强随机 token + Sheet 绑定邮箱”。

如果必须完全手填，按下面方式填：

1. 在 `Users` tab 新增一行。
2. 填入：

```text
email=<参赛者邮箱，小写>
full_name=<姓名>
team_name=<队名>
affiliation=<单位>
intended_use=<用途>
token=<强随机 token>
token_hint=<token 前 8 位 + ... + 后 4 位>
token_status=active
issued_at=<ISO 时间，例如 2026-07-15T14:30:00.000Z>
updated_at=<同上>
```

3. `token` 建议格式：

```text
RSC-<32 位大写十六进制/随机字符>
```

例如：

```text
RSC-7F3A2C9E1B0D4A6C8E5F9012ABCD3456
```

4. 同时在 `AccessRequests` tab 记录一行手工来源，方便之后审计：

```text
request_id=RSC-REQ-2026-MANUALxxxxxx
email=<参赛者邮箱>
status=approved
token=<同一个 token>
token_status=active
processed_at=<ISO 时间>
misc=manual token issue
notification_status=manual
```

### Token revoke

在 `Users` tab 找到对应用户，把 `token_action` 改成：

```text
revoke
```

触发器会把 `token_status` 改成 `revoked`，并撤销该用户已有 session。

### Token regenerate

在 `Users` tab 找到对应用户，把 `token_action` 改成：

```text
regenerate
```

触发器会生成新 token，撤销旧 session，并把新 token 邮件发送给参赛者。

### 发布 leaderboard

参赛者提交后，`Evaluations` tab 会出现对应评测 row。管理员手动填写这些字段：

```text
evaluation_stage=preliminary_simulation 或 final_real_robot
status=completed 或 published
schedule_at=<可选，评测时间>
published=true
published_at=<可选，发布时间>
success_rate=<数字，例如 38.5>
action_steps=<数字，例如 797.55>
real_time=<数字，例如 80.55>
inference_time=<数字，例如 80.55>
eval_time=<评测时间或说明>
videos_link=<评测视频链接>
notes=<内部/详情说明>
leaderboard_notes=<公开 leaderboard 说明>
episodes_json=<可选，JSON 数组>
```

网站 leaderboard 只显示满足下面条件的 row：

```text
Evaluations.published=true
并且
对应 Submissions.is_ranked=true
```

## 本地完整预览

本地预览也应该走同一套真实流程：同一个网页申请表单、同一个 Gmail label 审批、同一个 Apps Script Web App、同一个 Google Sheet。不要为了本地测试另写 mock backend。

1. 先完成 Apps Script Web App 部署。
2. 把 Web App URL 填到 `static/config.js` 的 `API_BASE_URL`。
3. 在 SSH host 上进入仓库目录：

```bash
cd /home/edemlab/challenge_ws/robosynchallenge_deploy_repo
python3 -m http.server 8020 --bind 127.0.0.1
```

4. 在本地机器做 SSH 端口转发：

```bash
ssh -N -L 8020:127.0.0.1:8020 <你的 SSH host>
```

5. 在本地浏览器打开：

```text
http://127.0.0.1:8020/#/register
```

6. 按真实流程提交网页表单、在 `robosynchallenge@gmail.com` 审核、拿 token、登录、提交 policy、编辑 Sheet 发布 leaderboard。

## CORS 失败时的 Cloudflare Worker 方案

如果浏览器从 GitHub Pages 或本地静态站点直接请求 Apps Script Web App 时遇到 CORS 或 redirect 问题，可以使用 `apps-script/cloudflare-worker.js`。

大致流程：

1. 创建 Cloudflare Worker。
2. 把 `cloudflare-worker.js` 内容复制进去。
3. 给 Worker 设置环境变量或 secret：

```text
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
```

4. 部署 Worker。
5. 把 Worker URL 填到 `static/config.js` 的 `API_BASE_URL`。

## 需要你提供给我以便直接更新 repo 的值

当前 repo 已经使用本次部署值：

```text
SPREADSHEET_ID=1fXT5BuNgMYKyYuWNQ1FvIVG0Hfl3NFQ3p8a1BS5v_Ec
API_BASE_URL=https://script.google.com/macros/s/AKfycbwg9Ee-ZK9eNiMeJGsjzjxF8D6TFMlcuqclrHrVi8-AKHHhP_rYk-FVLZ-3lRSWs-HIXQ/exec
```

`SPREADSHEET_ID` 没有写进前端配置；它只应该写在 Apps Script Properties 和部署文档里。`API_BASE_URL` 已经写进 `static/config.js`，因此网站登录和提交功能会连到这次部署的真实 Apps Script Web App。
