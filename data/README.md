# 南京地铁逐站资料

采集于 2026 年 10 月 1 日。以南京地铁官网公共车站目录为底册，覆盖目录中的 15 条线路、263 个独立车站；换乘站合并，保留分线路的官网 ID 和站序。S4 滁州段不在此目录中，未纳入。目录收录不单独证明线路当前运营状态。

原始缓存和中间解析文件仅保留在本地，GitHub 仓库仅分发三份公开 JSON、补充来源和说明文档。人工记录不随仓库或静态包分发。

## 文件

| 文件 | 用途 |
| --- | --- |
| `stations.json` | 机器收集的基础资料，网页直接读取此文件，打包时生成副本 |
| `manual-reviews.json` | 独立保存人工核对、实际位置和备注，按稳定车站 ID 索引 |
| `collection-report.md` | 覆盖情况、待补位置清单与优先核对事项 |
| `official-roster.json` | 官网各线路原始车站目录及采集元数据 |
| `official-articles.json` | 526 份官网车站简介、出站指南的解析内容 |
| `map-toilets.json` | 双语地图的厕所图标、站名和 PDF 坐标证据 |
| `toilet-supplements.json` | 政府答复、报道、百科等补充位置事实及来源 |
| `sources/` | 已下载的原始 HTML、JSON、PDF 缓存，供回查 |
| `metro-3d.json` | 车站坐标、地表高程、线路几何与单独记录的工程参考；所有轨面建模高度仍为空 |
| `cruise-routes.json` | 沿 OSM 节点连通轨道生成的 15 条连续巡航路径、图上距离、沿段标签、站点投影和缺失项 |
| `3d-research.md` | 三维来源、高程基准、显示策略和待补工程数据说明 |

## 基础 JSON 字段

顶层有 `schema_version`、`scope`、`collected_at`、`generated_at`、`stats`、`lines`、`stations`、`sources`、`collection_issues`。采集时间是实际取得来源的时间；`generated_at` 是重新整理输出的时间，不能当成来源发布或更新日期。

每个车站的主要字段如下：

| 字段 | 含义 |
| --- | --- |
| `id` / `name` / `aliases` | 稳定 ID、规范站名、官网名称及别名；ID 根据规范站名生成 |
| `line_ids` | 所属线路，例如 `["1", "2"]` |
| `official_station_ids` | 各线路的官网 ID 和站序 |
| `introduction` / `nearby` | 官方简介、出站周边；每项带 `source_id` |
| `toilets.availability` | 整座站的 `available`、`unavailable` 或 `unknown` |
| `toilets.by_line` | 按线路记录是否设置；部分换乘站一条线没有、另一条线有 |
| `toilets.locations` | 收集到的位置事实数组；保留不同来源、年代和线路 |
| `toilets.location_status` | `collected` 已有提示、`missing` 有厕所但位置未查到、`not_applicable` 未设厕所 |
| `toilets.nearby_alternatives` | 未设厕所车站沿线两侧最近的有厕所车站；换乘站可能需要走到其他线路站层 |
| `toilets.notes` | 冲突、旧资料和换乘限制说明 |
| `human_verified` | 是否由人工核对，基础采集记录统一为 `false` |
| `verification` | 空的人工核对占位；本地合并导出时填入实际核对记录 |
| `source_ids` / `collected_at` | 可追溯来源 ID、本站来源中最新的采集时间 |

位置条目包含 `line_ids`、`level`、`floor`、`paid_area`、`description`、`precision`、`source_id`、`human_verified`，部分包含 `direction`、`end`、`notes`、`accessible_toilet` 或 `map_evidence`。

- `level`：`platform` 站台、`concourse` 站厅、`commercial` 商业层、`non_platform` 非站台层、`outside` 站外等。
- `floor`：有依据时写 `B1`、`B2`、`1F` 等；未知为 `null`。
- `paid_area`：`paid` 付费区、`unpaid` 非付费区、`outside` 站外、`unknown` 待核对。
- `precision`：`direction` 有方向或端头、`floor` 有具体楼层、`exit` 有出口；`level` 只知道站台/站厅等，`non_platform_only` 仅知不在站台。
- `line_ids: []` 表示该位置来源未细分线路，不能自动套到换乘站的全部线路。
- 空位置数组与 `null` 表示没有查到，不表示没有厕所。`unavailable` 必须有对应来源。

每个来源记录 `id`、标题、发布者、链接、`published_at`、`collected_at` 和来源类型；部分记录 `information_as_of`、原始缓存路径与 SHA-256。页面没有注明发布日期时保留 `null`。百科页面日期可能是页面版本日期，不能当成设施现场核查日期。

## 收集方法与限制

厕所设置以南京地铁官网《卫生间提示》逐线路说明为依据，`method: official_summary_rule` 明确标明是总表规则转换成逐站记录。位置补充来自政府答复、2024 年 12 月双语地图、2018/2020 年报道和公开百科；来源年代分别保存，均未视作人工实地核对。

地图只提供“站台 / 非站台”图例。程序匹配图标与站名坐标，不将“非站台”自行推断成站厅、出口或付费区。错字对应保留原图站名；重名或无法可靠匹配的图标留空。地图未细分换乘站的不同线路，未据此推断每条线的位置。

“有位置提示”共 191 站，其中只有 14 站含具体楼层、方向端头或出口提示；64 站的厕所位置仍空。8 站按官方总表未设厕所。即使位置较具体，也可能使用旧终点站作为方向描述，应结合现行站内标识核对。所有记录都待人工核对。

## 人工核对

本地访问 `/?edit=1#station-info` 后可在“逐站人工核对”中填写实际位置、厕所状态和备注，实际核对后才勾选。`manual-reviews.json` 的 `reviews` 按车站 ID 保存：

```json
{
  "schema_version": "1.0.0",
  "reviews": {
    "车站稳定ID": {
      "human_verified": false,
      "toilet_availability": null,
      "toilet_location": "",
      "notes": "",
      "reviewer": null,
      "verified_at": null,
      "updated_at": "保存时间"
    }
  }
}
```

人工补充优先显示，原始收集资料保留供对照。核对标记表示人工核对了本站的厕所资料，不自动证明每一条历史来源、车站简介或周边资料都正确。

网站下载 JSON 调用本地 `/api/stations/export`，合并 `human_verified` 与 `verification`，增加 `effective_toilet_availability`（人工状态优先）和 `effective_toilet_location`（人工填写的位置，未填写时为 `null`）。原始位置仍在 `toilets.locations`，合并导出不修改基础 JSON。

重新采集和构建不会覆盖人工文件。原始缓存默认复用；需要重新采集时先备份并移走相应缓存。补充资料可维护在 `toilet-supplements.json`，重建后运行一致性检查。
