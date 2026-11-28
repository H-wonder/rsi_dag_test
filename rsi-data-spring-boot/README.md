# rsi-data-spring-boot

第三轮的 rsi-flow Spring Boot 后端。负责：

- `POST /api/engine/flow` 接收结构 JSON；
- `FLOW_RUN` → `FlowCodeRun` → `StructureExecutor`；
- `fetch/action` 通过 bridge 调 AutomationBench 世界；
- 执行结束后从 bridge `/score` 取分并返回前端。

循环实现、`extract`、`LoopRunner` 等代码在
`core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/`。

## 环境

- JDK 8
- Maven 3.9+
- MySQL 8（或 Docker）

仓库自带 `libs/maven-repo/`，包含 `flow-*`、`horsecoder`、`scheduler` 等私有依赖，
不需要 Nexus 账号就能构建。

## 1. 起 MySQL

```bash
docker compose up -d mysql
```

默认库/账号（仅本地开发）：

```text
数据库：flowtest
用户：flowtest
密码：flowtest
端口：3306
```

如果本机已有 MySQL，可跳过 Docker，改用环境变量覆盖：

```bash
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/flowtest?useUnicode=true&characterEncoding=utf-8&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai'
export SPRING_DATASOURCE_USERNAME=flowtest
export SPRING_DATASOURCE_PASSWORD=flowtest
```

## 2. 构建

```bash
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64

# 如果拿到学长提供的内网 settings.xml（不要提交到仓库）：
mvn -s /path/to/settings.xml -DskipTests package

# 没有 settings.xml 也可以用仓库自带的 libs/maven-repo 尝试构建：
mvn -DskipTests package
```

产物：

```text
core-starter/target/core-starter-1.0.0-executable.jar
```

如果 Maven 仍在尝试访问私有 Nexus，确认 `mvn -v` 是 Maven 3.9+，
并在仓库根目录执行；`pom.xml` 的 `vendor-local` 会优先读
`libs/maven-repo/`。

## 3. 启动

```bash
java -jar core-starter/target/core-starter-1.0.0-executable.jar \
  --spring.profiles.active=test \
  --eureka.client.register-with-eureka=false \
  --eureka.client.fetch-registry=false
```

默认端口 `39910`。看到 `Started AppStarter` 即启动成功。

## 4. 验证

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://127.0.0.1:39910/api/engine/flow \
  -H 'Content-Type: application/json' \
  -d '{"flowId":"@com.horsecoder.common.whuTalent.flowTesting.core/FLOW_RUN","params":{"structure":"{\"meta\":{\"task\":\"smoke\"},\"nodes\":[{\"id\":\"a\",\"type\":\"assert\",\"expr\":\"1==1\"}],\"edges\":[[\"start\",\"a\"]]}"}}'
```

返回 200 说明后端链路正常。

## 5. 跑完整任务

完整任务还需要：

1. AutomationBench bridge（`world_bridge.py`，在总仓库的 `bridge/`）；
2. 结构 JSON（在总仓库的 `structures/`）；
3. 前端（`../rsi-data-platform`）。

启动顺序和命令见总仓库
[README](../README.md) 的“如何运行 / bridge 启动方式”。

## 配置与密钥

`application-test.yaml` 已改为环境变量：

```yaml
url: ${SPRING_DATASOURCE_URL:...}
username: ${SPRING_DATASOURCE_USERNAME:flowtest}
password: ${SPRING_DATASOURCE_PASSWORD:flowtest}
```

仓库里不包含任何真实数据库密码、API key 或 `settings.xml`。
