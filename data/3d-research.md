# 三维线网数据与研究记录

采集日期：2026 年 10 月 1 日。网页入口：`http://localhost:4173/terrain.html`。

## 当前能做什么

已取得 OpenStreetMap 公开车站坐标、线路轨道几何和 Mapzen Terrain Tiles 地表高程，构建了可旋转、缩放的地形线网。范围沿用官网目录的 15 条线路、263 站，不含 S4 滁州段；其中 262 站已匹配坐标，红山新城站缺少可靠公共站点坐标，保留 `null`。

这不是完整地下轨道模型。彩色线路的高度来自其经纬度位置的地表栅格投影；地下隧道、站台、桥面高度没有据此推算。OSM 的 `layer` 只是相对上下层级，不能转换为米数。

| 数据 | 当前来源与用途 | 限制 |
| --- | --- | --- |
| 车站位置、线路水平走向 | OSM 快照；325 条轨道 way，保留原对象 ID | 非地铁官方测绘；换乘站节点取平均位置，不能代表分线路站台中心 |
| 地表海拔 | Mapzen Terrarium，按经纬度双线性插值；高程参考 EGM96 | 历史 SRTM / GMTED 为主；建筑物、植被、插值和地形变化会影响结果 |
| 莫愁湖站 7 号线设计轨面标高 | 专利 CN112376620A 说明书 [0017]：-24.000 米 | 原文未注明高程基准；设计资料不是竣工实测；仅列参考，不接入轨道模型 |
| 莫愁湖站结构底板埋深 | 同一工程实例：标准段 33.56 米，端头井底板底 35.26 米 | 结构埋深不是轨面埋深 |
| 清凉山站结构最大深度 | 南京市政府报道：地下 7 层，最深处约 52 米 | 报道未说明对应轨面；保留为结构深度 |

所有坐标、高程、工程观察的 `human_verified` 初始为 `false`。机器资料不会改写现有厕所人工核对文件。

## 文件与字段

- `metro-3d.json`：结构化三维资料，网页副本在 `../dist/data/metro-3d.json`。
- `sources/3d/osm-metro.json`：原始站点与路线 relation 快照。
- `sources/3d/osm-track-details.json`：325 条轨道的原始几何、标签及路线停靠节点。
- `sources/3d/terrain/`：54 张 zoom 11 高程瓦片和对应 HTTP 元数据、下载时间、原始影像来源、SHA-256。
- `sources/3d/mochou-patent.pdf`：公开专利原文，物理 PDF 第 4 页；公布日 2021-02-19。
- `sources/3d/qingliang-government.html`：政府报道原文，发布日期 2024-09-11。

站点 ID 与 `stations.json` 保持一致，可直接关联厕所、出入口和人工记录。主要字段：

| 字段 | 含义 |
| --- | --- |
| `stations[].coordinate` | 经度、纬度、EPSG:4326、匹配方法、OSM 原对象；未知为 `null` |
| `ground_elevation_m` / `ground_vertical_datum` | 站点位置的地表估值及高程参考；不是站厅或站台高度 |
| `ground_quality` | `sampled_unverified`、`suspect_negative_dem` 或 `missing_coordinate` |
| `rail_elevation_m` / `rail_vertical_datum` | 可用于轨道几何的绝对高程；当前全为空 |
| `rail_elevation_status` | `missing` 或 `reference_only`，后者表示有未具备建模条件的原文数值 |
| `engineering_observations[]` | 原文数值、类型、所属线路、相对基准或高程基准、来源和段落定位、人工标记 |
| `ways[].geometry` | `[经度, 纬度, 地表估值]`，第三项绝不是轨道高程 |
| `ways[].structure` / `relative_layer` | OSM 隧道、高架标签和相对层级，不能据此算高度 |
| `suspect_ground_vertex_indices` | 一条 way 中负高程的顶点下标，原值保留 |
| `terrain` | 南北、东西边界、321 × 481 地形网格、原始高程、疑似异常下标和显示策略 |
| `sources` | 原始链接、实际下载时间、发布日期、缓存路径及哈希；未成功取得的候选来源标 `not_collected` |

数据的 `generated_at` 是整理日期，不能作为测绘或现场核对日期。重复构建使用瓦片缓存，保留原下载时间；瓦片 HTTP `last_modified` 多为 2017 年，亦不能替代底层测高年份。

## 精度与待核对项

zoom 11 瓦片在南京的像素间距约 65 米。它是取样间距，不是精度承诺。显示地形网格间距约 223–277 米；站点和轨道顶点直接采样原瓦片。站点整数海拔是历史栅格估值，不能用于推算站内楼层。

部分地形网格和线路顶点出现负高程，已标为疑似异常，尚不能解释成真实河底深度。JSON 中保留原始数值；地图将负值暂置于 0 米，地形标灰。0 米只是显示占位，不是核实后的海拔。具体数量见 JSON `stats`。

6 号线公开 OSM 路线仍有“白马公园”站名，而官网目录列有“红山新城”。这里未将两者替换、合并或自动视为同站；保持官网目录，并在 `collection_issues` 保留差异。草场门·南艺·二师、徐庄·苏宁总部按明确名称对应官网简称。

后续构建真正的地下三维线网，至少需要逐段轨道里程与轨面竣工标高（线路纵断面），以及可转换到同一参考的高程基准；车站各线的站台中心也应分别定位。只有“埋深约多少米”或基坑最大深度，不能复原整条线路纵坡、换乘层级和跨江轨道高度。本次检索尚未取得可核对的全网此类数据。

## 来源

- [OpenStreetMap 版权与 ODbL](https://www.openstreetmap.org/copyright)
- [OSM layer 定义](https://wiki.openstreetmap.org/wiki/Key:layer)
- [Mapzen Terrain Tiles 公共数据](https://registry.opendata.aws/terrain-tiles/)
- [Terrain 格式与高程说明](https://github.com/tilezen/joerd/blob/master/docs/formats.md)
- [Terrain 原始数据与精度](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md)
- [莫愁湖站工程实例专利](https://patents.google.com/patent/CN112376620A/zh)
- [清凉山站政府报道](https://www.nanjing.gov.cn/zgnjsjb/jrtt/202409/t20240911_4761800.html)

另查到 4 号线二期报道提到最低处位于江面下 68.58 米，但它相对江面且属于二期工程，未拿来当作当前线路海拔。没有已知江面绝对高程和线路位置时，不能将其直接减自海平面零点。[原报道](https://www.nanjing.gov.cn/zzb/ywdt/msxx/202410/t20241022_5125764.html)

## 维护

运行 `python scripts/build-3d-data.py` 重新生成资料（需 Pillow）；优先读取本地原始快照和高程瓦片，缺少瓦片时联网下载。运行 `python scripts/validate-3d-data.py` 检查目录关联、几何覆盖、原始来源哈希、空轨面高程和异常值保留。重新采集 OSM 时，应同时更新路线 relation 与其引用的 way、stop 节点，不能只刷新一半。

前端使用本地 vendored Three.js 0.180.0，MIT 许可见 `../dist/vendor/THREE-LICENSE.txt`。运行页面不需要 CDN 或 API key。地形数据署名：Mapzen Terrain Tiles；global GMTED2010 / SRTM terrain data courtesy of the U.S. Geological Survey。OSM 派生几何保留 ODbL-1.0 来源标记。

## 按线路巡航

参考[梨鸭黄的郑州 3D 地铁拓扑视频](https://www.bilibili.com/video/BV183yDYCE7o/)中粗线、车站节点、局部镜头与按线路讲述的方式，改为用户可操作的网页。没有将参考视频的拓扑高低关系套用为南京轨面海拔。

`cruise-routes.json` 与网页副本记录 15 条连续路径、4,699 个有原始 OSM 来源的线段。路径按 OSM **节点 ID** 连接，避免仅凭平面交叉就将不同轨道连接。先找端到端的连续轨道，再将官网顺序的车站投影到同一条轨道，避免逐站在左右两侧轨道切换导致绕行到远处折返。轨道几何保留实际公开弯曲走向；不画跨越断裂数据的虚构直线。

每条路径记录 `line_id`、`geometry`、`cumulative_distance_m`、`length_m`、`stations`、`excluded_stations` 和 `segment_tags`。站点事件保存稳定 ID、投影后的图上距离、原位置离轨距离（`snap_distance_m`）与原有地表高程。每段标签保存 OSM way ID、隧道/桥梁/未标注类别及相对 `layer`，全部待人工核对。图上的 HUD 随位置展示这些原始标签；仍不将相对层级解释成米数或官方站内楼层。

累计距离是沿轨道平面几何计算的水平距离；不包括真实纵坡，也不代表官方营业里程。进度和海拔曲线的横轴使用这项距离。巡航游标的地表值沿原轨道顶点插值；车站详情仍显示车站坐标处的原瓦片采样值，两个采样位置可能有小幅差异。巡航没有复原列车实际运行轨迹、速度或时刻。

6 号线 20 站中，红山新城仍缺可靠坐标；巡航定位 19 站，明确列出该缺项。记录继续保留在全站目录，不猜测它在路径上的距离。选到该站时显示待补；不会自动伪造坐标。

界面支持播放、暂停续播、反向、0.5–4 倍演示速度、拖动进度、前后站跳转，以及跟随镜头开关。手动拖动、缩放或键盘旋转会暂停；点击继续可从当前位置重新巡航。海拔曲线圆点、地图站名和站点搜索均可用于查看。地形可淡化或隐藏，纯净线网模式保留线路的地表估值、高程参考线和图上位置。

默认高差为 8 倍，只改变画面，数值保持原始估值。结构深度杆仍是相对地表示意，与游标到零高程面的参考线分别绘制；不能把任何一条杆当作真实轨面埋深。

重新生成顺序为 `scripts/build-3d-data.py` → `scripts/build-cruise-data.py`。巡航文件保留三维资料和原始 OSM 节点缓存的 SHA-256；`scripts/validate-cruise-data.py` 检查每段确实位于原始轨道线段上、站序与距离单调、标签来源一致、没有漏记缺项；`scripts/test-cruise-path.mjs` 检查路径采样边界、插值和所有线路的取样。
