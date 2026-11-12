# 真机决赛系统设计与实施记录

2026-11-12 更新：已按用户授权上线网站和提交后端，未操作硬件，未变更初赛数据。

## 当前部署与验收

- 正式入口：https://robosyn-bench.net/finals/ ；技术报告：https://robosyn-bench.net/#/workshop/submit 。
- 五阶段测评后台 `eval_backend/finals/` 已上线，Google Apps Script 控制生产版本 122；证据清单仅向有权限的测评者显示路径、对象 ID、大小及 SHA256，不新增匿名分享。
- 21 队正式白名单与测试账号分开；截止点为 `2026-11-16T12:00:00Z`（11 月 15 日 23:59 AoE 结束）。
- 技术报告存入独立私有 Google Drive 目录，初/决赛分开；实际系统测试 PDF 已送达组织者邮箱，附件大小核对一致。没有向参赛者发送测试邮件。
- `rsc-finals-prepare.service` 已运行，截止后执行版本冻结及分支合成；冻结配置基线为 real 仓库 `1139aa826169ee8e02b5d1e7941ac0f59d0c6723`。prepared 只表示合成完成，不代表模型验证成功。
- 中央控制已接通网站公网 Apps Script；原 `127.0.0.1:8097` 仅为本地参考实现。正式测评入口为 `/eval_backend/finals/`。
- guiliangliu/p7 的真实 RTX 5090 测试模型通过 CUDA、TLS、身份、reset、三路 640x480 图像与关节动作数值核对。v3 以 `_deploy` 实际客户端运行 20 个假机械臂动作，两个会话；网络往返中位数 97 ms、P95 119 ms。不是选手大模型性能或硬件验收。
- 只使用既有 EIP 及自己的 DNAT，不新建 EIP。新测试使用 `118.145.32.134:26200`，旧测试资源按生命周期清理。
- real 核心与运维 55 项测试通过；官方 ACT 的实际 eval/reset 通过 10 步 CPU 假模型回放；Python 3.10 全新环境中决赛客户端 10 项无硬件测试、原有客户端 14 项回归和 11 个子测试通过。
- 删除专用测试 CCI 后，后台自行探测、重建第 2 代并验证就绪，耗时约 13 分 36 秒；恢复通知已发送。新代际再次通过实际客户端 20 步回放。指令间隔中位数 229 ms，当前单步反馈桥接不能宣称实测 10 Hz。
- 200 个签名虚拟 attempt 的完整五阶段流转、十任务验收与单 slot 替换通过内存回归；无云上传或真实测评。取消服务后清理异常只重试，迟到的状态更新不会复活服务。
- 真实 Drive + 公网控制测试上传 3431 字节，签名/重复登记/废弃后拒绝迟到回执及清理通过；没有下载已上传证据。
- 平台各自克隆 `challenge_deploy` 的 `rsc`，不要求 SSH。官方 wheel 随仓库固定版本分发；`setup_finals.py` 从私有接入包安装本地配置，不连接硬件或自动开始测评。

公网控制、CCI 构建/恢复服务及通知服务已经部署。尚未完成的是正式选手真实权重逐队验证（当前正式提交为 0）、platform_2/3 的正式接入资料、现场硬件验收、完整决赛纠错表工作流，以及通用多动作 chunk 的兼容/吞吐验收。详细现状见私有 real 仓库 `docs/REAL_FINALS_ARCHITECTURE_ZH.md`；云端恢复演练以私有回执为准，不能用单元测试冒充实测。

## 已确认规则

- 路由粒度为队伍×任务。同一组合在一个 platform 上做完 20 次；不同队伍同一任务可以在不同 platform。
- 5 种 setting：基础、高光、蓝布、花布、干扰物，各 4 次。
- click_bell 粉色铃铛、drawer_open_place 抽屉上下换、table_rearrangement 盘子颜色、items_handover 笔颜色、water_pouring 水杯颜色：各在对应任务的 20 次中出现 3 次，属于叠加条件。
- 测评者可直接废弃无效实验并重做原 slot，无需审批。正常策略失败仍是有效结果。删除证据，不删除最小操作审计；上传取消和删除使用同一 attempt ID，防止后台重新上传。
- 真机每局最多 1000 个动作帧；本地 chunk_sync 串行执行。
- 不测试 challenge_deploy 硬件。

## 实地核查发现

实际网站在 robosynchallenge_deploy_repo，后端是 Apps Script；website/ 是另一套旧 Flask 网站，不能修改错入口。现有工作树存在大量初赛运维改动，不覆盖或提交它们。

challenge_deploy 的 run_openpi_client 默认 chunk_sync，但依赖 OpenPI train_config；不能直接宣称它是任意策略的通用客户端。clients/websocket_client_policy.py 的 reset 是空实现，正式桥接必须显式 reset 并验证确认。

公开策略入口为 policy/<name> 下的 eval.sh、deploy_policy.yml、deploy_policy.py，模型接口是 get_model、eval、reset_model。eval 通常调用 env.step 后更新观测。evaluation_system/policy_service.py 已有受限 RemoteEnv 思路，可复用其边界而不是公开整个仿真对象。

关键限制：不允许执行一串虚拟 step 却返回相同旧观测以制造 chunk。通用协议先以单动作 chunk 保留反馈；真正多步 chunk 需要逐策略验证，不能自动改变策略行为。EEF 输出必须在选手 policy 内转换为官方关节动作，不能把选手 IK 移到真机本地执行。

## 提交与权限

增加 /finals/ 页面，复用原账号登录。决赛资格已确认以之前入群邮件的 21 队为准，不能依据实时榜单或客户端声明。测试账号资格单独配置，不占正式 21 队名额。

独立 FinalsRequests 数据表，与 Submissions/Evaluations 分离。每次提交保存完整不可变快照、版本、幂等键与内容摘要。相同重试不新建请求；修改后产生新 revision，不就地改变已测记录。

表单必填：方法名、说明、GitHub repo、依赖安装说明、数据来源、运行环境及显存要求、各任务 policy 路径和配置参数。代码分支可选，空白表示仓库默认分支。权重以多项列表提交，每项包含 HF repo、可选分支（默认 main）、相对路径；支持共用编码器和同一任务多个 checkpoint。无权重方法显式说明。README 和运行说明一并审核。

2026-11-12 按用户最新要求取消手填代码 SHA 和 HF revision。提交时后台记录 latest_before_deadline 策略及截止时间；截至 11 月 15 日 23:59 AoE 的最后一分钟应使用排他的 UTC 截止点 2026-11-16T12:00:00Z。截止后，evaluation_tools/finals_version_freeze.py 复用初赛的 version_selection 规则，选择指定分支可达且时间早于截止点的最新 Git/HF commit。Git 检查 author/committer 时间，HF 检查 commit 时间；不下载权重。实际 SHA 单独追加到 FinalsVersions，幂等重试且不得覆盖；没有冻结回执，不得标记代码 prepared。

冻结 worker 已由持久用户服务启动，复用初赛 preparation 的 huggingface_hub 及 private tools；配置键为 api_url、organizer_email、organizer_token_file、participant_token_file、hf_token_file（可选）、state_dir，以及已锁定的 real 仓库和基线 SHA。凭据不得放进网站静态目录。命令：python3 evaluation_tools/finals_version_freeze.py --settings /private/finals-settings.json --private-tools /path/to/robosynchallenge_heldout_private/tools；--once 用于一次检查。冻结与分支合成相连，状态与指数退避保存在私有 state_dir。

专用只读页面 /finals/preview/preliminary/ 直接复用正式非入围者页面文案，不登录、不调用提交接口、不改变白名单。正式登录后，非入围者看到感谢说明、技术报告建议和论文链接，可以跳到已上线的 Workshop 技术报告提交页。

非入围者登录后展示感谢与未入围说明，强烈建议提交技术报告，说明将列入初赛技术报告，推荐 arXiv 并引用官方论文；论文链接和报告提交入口必须用核实配置，未配置不能伪造。

## 代码合成

独立私有仓库 robosynchallenge_real。官方基础代码与选手 policy 分离，按 full SHA 导出 policy 树，拒绝越界符号链接/submodule。检查入口并生成来源清单、各文件 SHA256、任务映射、HF revision；不执行选手安装脚本进行静态合成。

每个 request 独立分支，正式运行绑定 bundle SHA 与 task configuration digest；已有结果始终保留原版本。目标私有仓库 ZhaoRunyi/robosynchallenge_real 已创建并推送。自动合成仅创建新分支，使用远端不存在的原子条件，已存在分支先核对来源并恢复回执，不覆盖它。

构建与推理容器不能获得网站管理、云账号、全局上传凭据。选手代码不能直接下发 CAN。官方监督进程掌管会话、动作检查和日志，选手进程单独隔离。全局管理员密钥不得进入选手镜像。

## 协议与可信执行

统一 envelope 绑定 protocol、request_id、task、platform、bundle_sha、attempt_id 和单调序列号。start/reset/infer/finish 独立；断线不自动重放动作，重连后已执行情况不确定的 attempt 标记待人工处理。

输入为实际图像和机器人反馈；保留完整图像与准确单位，在远程适配公开 sensor/robot 结构。关节维度、控制顺序、夹爪归一化/米转换必须对照公开模型，不能套用 OpenPI 数据集 raw 编码。

动作在官方本地层检查维度、有限值、关节限位及有效期。1000 步由实际发出指令计数；不把视频帧数、推理次数或 chunk 数当动作步数。模型只输出动作，不拥有成功判定权。

记录本地发送动作、反馈、推理请求/响应与实际执行时间、视频、初始摆放图、平台配置摘要、版本和测评者判定。软硬件错误与策略失败分开。成功条件依官方任务规范人工确认。

## 槽位、摆放与调度

所有队伍使用同一 setting/变体 slot 模板；变体固定在 2、10、18，代码不随机抽取。part1/2/3 分别绑定 platform_1/2/3；完整图只需保存在对应平台，安装时填写本地路径，按组织者指定 manifest 摘要检查。中央服务只保存索引和图片摘要。

首次开测锁定队伍×任务的 platform。队列按 platform/任务/setting 聚合，减少换布景，队伍间轮转避免永远由同一队先测。每局仍恢复物体并对照该 slot 参考图，不能延用上一局终态。

现场仅看 rsc 分支官方客户端。任务卡显示队伍、任务、slot/20、setting、物体变体、seed、版本与 endpoint 状态。先确认摆放图，再开始，完成后判定/废弃。禁止一键启动机械臂。相机健康检查在开工、重插、碰撞、支架调整后进行，逐局只做摆放检查。

废弃使用 attempt tombstone，旧 attempt 不再计分且不能重新上传/注册。原 slot 新建 attempt，其他 slot 和测评阶段不回退。取消云上传、删除已上传对象需要可重试 outbox，先停止注册再清理；不能声称瞬时物理删除跨云文件。

## 上传与存储

本地先封包、生成文件清单和 SHA256，持久化 outbox 后后台上传。按实际连通性/可用空间选择 OneDrive 或 Google Drive，注册索引固定到 attempt 和版本，网络恢复自动重试。不把云端完整证据重新下载进行校验；只比较服务端元数据和可获得的摘要。

初赛迁移 worker 不直接复用于决赛数据：路径、request namespace、删除队列、发布权限全部分开。上传成功不等于审核成功。仅在完整封包、摘要及索引注册成功后标记 evidence_ready。

## SCO / CCI / EIP

已阅读用户提供 use-sco.tar.gz 的操作资料，其中其他账号凭据未复用。SCO 已隔离安装到 sco_infra/local，已核对 guiliangliu 身份和 p7 资源。资源策略是标准资源优先，容量/配额不足时使用 SPOT；鉴权、镜像配置或未知创建结果不能直接触发重复申请。

CCI 是推理服务容器；EIP 为公网入口，通过 DNAT 绑定服务端口。EIP 不必技术上与每个实例一一对应，可用独立端口/网关；最终按权限和隔离需要决定。官方参考：
- https://www.sensecore.cn/help/docs/CLI/SCO_Refrence/EIP/instances/create-dnat
- https://www.sensecore.cn/help/docs/CLI/SCO_Refrence/EIP/instances/bind-dnat

诊断分为实例状态、模型加载、服务协议版本、鉴权、EIP/DNAT、测评机网络。RUNNING 不能代表模型可用。sco 的 --debug 是调试输出选项，不能假定存在通用的 sco debug 子命令；命令须按实际安装版本帮助核验。

所有队伍服务长期在线为目标，但在配额/镜像/模型显存未核实前不批量创建。申请重建需幂等 request，审批后创建新实例，探活通过再切换 endpoint generation，通知测评者；不能接管其他运行中的 DNAT，也不能在当前 rollout 中途静默切换模型。

## 实施顺序与验收

1. 网站独立决赛入口、服务端资格/字段校验、幂等提交、本地页面预览。
2. 本地 robosynchallenge_real 核心：确定性 slot 模板、分配/attempt 状态机、静态合成、协议验证及单元测试。
3. 真实公共 adapter 的软件回放测试，fake robot + chunk_sync，证明逐步反馈与 reset 正确；不连接硬件。
4. 结合已确认账号的 CCI/EIP 软件网络探测，验证鉴权/超时/断连/重建；需要配额与凭据。
5. 云端证据存储与取消/删除队列集成，测试故障恢复，再接真实数据。
6. 各平台通过私有接入包配置身份、参考图摘要和经审核的控制参数；后续硬件验收须另行授权。无需提供平台 SSH 密钥。

此文档是设计与进度依据，不代表上述所有步骤已完成。测试必须标明本地模拟、真实网络、或硬件验收，不能混用。
