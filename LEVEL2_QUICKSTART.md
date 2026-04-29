# Level 2: Dynamic Profiling - Quick Start

## What Was Built

✓ **Java Agent** (`profiling-agent/` module) using Byte Buddy
✓ **Method Interception** - All calls between org.mybatis.jpetstore.* classes
✓ **Automatic Data Export** - Writes `dynamic_calls.json` on server shutdown
✓ **Helper Scripts** - Windows & Linux/Mac deployment scripts

## File Structure

```
profiling-agent/
├── pom.xml                          # Maven config for agent JAR
├── src/main/java/org/mybatis/jpetstore/profiling/
│   ├── ProflingAgent.java           # Main agent class (Premain-Class)
│   ├── MethodInterceptor.java       # Byte Buddy advice for interception
│   └── CallRecorder.java            # Records & exports profiling data
└── src/main/resources/META-INF/
    └── MANIFEST.MF                  # JAR manifest with Premain-Class
```

## Quick Start (Windows PowerShell)

```powershell
cd target-monolith

# Option 1: Use convenience script (Recommended)
.\run-with-agent.ps1

# Option 2: Manual commands
cd profiling-agent
mvn clean package
$agentPath = (Get-Item target/jpetstore-agent.jar).FullName
cd ..
mvn cargo:run "-Dcargo.jvmargs=-javaagent:$agentPath"
```

## Quick Start (Linux/Mac)

```bash
cd target-monolith

# Option 1: Use convenience script (Recommended)
chmod +x run-with-agent.sh
./run-with-agent.sh

# Option 2: Manual commands
cd profiling-agent
mvn clean package
export AGENT_JAR="$(pwd)/target/jpetstore-agent.jar"
cd ..
mvn cargo:run "-Dcargo.jvmargs=-javaagent:$AGENT_JAR"
```

## What Happens

1. **Agent loads at startup**: `[ProflingAgent] Starting JPetStore Dynamic Profiling Agent...`
2. **All method calls recorded** in memory during runtime
3. **Press Ctrl+C** to stop server
4. **Agent writes data**: `[ProflingAgent] JVM shutting down, writing dynamic_calls.json...`
5. **File created**: `dynamic_calls.json` in working directory

## Output Format

```json
{
  "metadata": {
    "totalCalls": 1234,
    "totalCallFrequency": 56789,
    "uniqueSourceClasses": 12,
    "uniqueTargetClasses": 15,
    "timestamp": 1234567890000
  },
  "calls": [
    {
      "sourceClass": "org.mybatis.jpetstore.service.CatalogService",
      "targetClass": "org.mybatis.jpetstore.mapper.CategoryMapper",
      "frequency": 456
    },
    ...
  ]
}
```

## Integration with Analyzer

Compare static (jdeps) vs runtime (agent):

```bash
# 1. Get static graph
cd analyzer-tool
node analyzer.js > ../jdeps-output.txt
node clusterer.js
node metrics.js

# 2. Get runtime graph (from dynamic_calls.json)
cp ../target-monolith/dynamic_calls.json .

# 3. Enhance analyzer to use both:
# - Keep jdeps for complete dependency graph
# - Overlay dynamic_calls for hot paths (high-frequency calls)
```

## Next Levels

**Level 3: Visualization** - Overlay dynamic call frequency on graph (hot paths = thicker edges)
**Level 4: Extraction** - Use both static & dynamic to auto-suggest microservice boundaries
**Level 5: Implementation** - Generate microservice interfaces from high-frequency edges
