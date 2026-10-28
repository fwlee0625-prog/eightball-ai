# 数据契约与逐杆样本示例 V0（自定义草案）

## 必须字段
| 字段 | 含义 | 校验 |
|---|---|---|
| schema_version | 契约版本 | 例如 0.1.0 |
| table_id | 球桌唯一标识 | 脱敏 ID |
| match_id / rack_id / shot_id | 对局、局、杆关联 | 不为空 |
| state_version | 静止球局版本 | 单调递增 |
| units / coordinate_system | 米/坐标原点朝向 | 必须显式说明 |
| table_geometry | 内边界、六袋中心/轮廓、球半径 | 与实际球桌标定一致 |
| ball_positions | 球号、xy、置信度、是否在台 | 不越界，球不重叠 |
| ruleset_id / turn / group | 规则版本、当前击球方、花色归属 | 允许 unknown |
| trajectories | frame_index、timestamp_ns、球位置 | 单调时间戳，允许缺帧并标记 |
| expert_intent | 口述原文、标注字段、时间戳 | 不与测量数据混同 |
| actual_outcome | 实际进球、白球停位、犯规等 | 缺失允许 null |
| provenance | 来源、授权范围、版本及采集设备 | 不记录私密身份信息 |

## 最小 JSON 样例（演示性人工数据，不代表正式比赛台面尺寸）
```json
{
  "schema_version":"0.1.0",
  "table_id":"sample-table",
  "rack_id":"sample-rack",
  "shot_id":"sample-shot-001",
  "state_version":1,
  "units":"meter",
  "coordinate_system":"origin=left-bottom; x=long-axis; y=short-axis",
  "ruleset_id":"cn-eightball-TBD",
  "balls":[
    {"id":0,"x":0.50,"y":0.55,"confidence":1.0},
    {"id":1,"x":1.20,"y":0.55,"confidence":1.0}
  ],
  "expert_intent":{"raw_text":"一号球中袋，轻推跟进","aim_ball_id":1,"power_label":"light","cue_spin_label":"follow"},
  "trajectory_ref":null,
  "actual_outcome":null,
  "provenance":{"kind":"synthetic-demo","permission":"public-demo"}
}
```

## 数据管线
1. 原始 200FPS 数据 append-only 归档；保留采样时间与视觉版本。
2. 将时间对齐到击球开始 t=0；插值只用于展示和评估，并保留原始记录。
3. 生成每杆的轨迹文件和小型 metadata JSON，按 shot_id 关联视频音频标注。
4. 口述“用五成力”为主观标签，不可直接转成物理速度。
5. 划分数据集时优先按球员、球桌和日期分组，防止相邻帧或同一杆跨训练/测试集。

## 需要数据提供方明确的问题
是否有真实采样时钟？球直径/台面尺寸？袋口检测？球号追踪丢失率？能否提供球局静止标记？哪一种赛事规则？是否能在训练/个人项目中合法使用？
