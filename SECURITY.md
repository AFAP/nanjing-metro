# 安全与隐私 · Security and privacy

- 本地服务仅监听 `127.0.0.1`，检查请求 Host 和写入请求 Origin。
- 补充记录保存在 `data/manual-reviews.json`，含备份，全部由 `.gitignore` 排除。
- 静态打包只复制 `src/` 和三份公开 JSON，不包含本地记录、缓存或部署配置。
- 风格选择只存入浏览器 localStorage，不发送到外部服务。
- 安全问题请通过 GitHub 私密漏洞报告联系维护者，不在公开 issue 中贴凭证或个人记录。

The server binds only to loopback and validates request hosts and write origins. Local records and backups are ignored. Static packages contain only web sources and three public datasets. Style preferences remain in browser storage. Use GitHub private vulnerability reporting for security issues; omit credentials and personal records from public issues.
