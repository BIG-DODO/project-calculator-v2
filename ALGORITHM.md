# 产品配置算法 - 完整算法描述（第零步到第五步）

## 全局变量与输入验证

### 建筑密度D计算

```
function calcDensity(far):
   if far < 1.5: return 0.45
   else if far < 2.0: return 0.42
   else: return 0.40
```

### 输入验证

```
function validateInput(projectData, selectedProducts, productOptions):
   errors = []
   
   // 基本参数校验
   if projectData.landArea <= 0: errors.push("用地面积必须大于0")
   if projectData.far <= 0: errors.push("容积率必须大于0")
   if projectData.heightLimit <= 0: errors.push("限高必须大于0")
   if projectData.ancillaryRatio < 0: errors.push("配套占比不能为负")
   if projectData.rdRatio < 0: errors.push("科研办公占比不能为负")
   if projectData.ancillaryRatio + projectData.rdRatio > 1: errors.push("配套占比+科研占比不能超过1")
   
   // UI限制校验（由算法入口执行，也可由UI层提前拦截）
   if projectData.ancillaryRatio > 0:
      if not selectedProducts.has('dorm') and not selectedProducts.has('support'):
         errors.push("配套用房未选择：R2>0时必须选择配套楼或配套宿舍")
      
      totalAncillary = projectData.landArea * projectData.far * projectData.ancillaryRatio
      if totalAncillary > 2400 and selectedProducts.has('support') and not selectedProducts.has('dorm'):
         errors.push("配套用房面积未用尽，请勾选配套宿舍")
   
   // 厂房类型组合校验
   if selectedProducts.has('layer') and selectedProducts.has('light-steel') and not selectedProducts.has('split'):
      errors.push("未选择分栋厂房：选择分层厂房和轻钢厂房时必须选择分栋厂房")
   
   // 层数限制校验
   if selectedProducts.has('split') and productOptions['split']?.floors?.length > 2:
      errors.push("分栋厂房层数类型超过2种")
   if selectedProducts.has('layer') and productOptions['layer']?.floors?.length > 2:
      errors.push("分层厂房层数类型超过2种")
   
   return errors
```

---

## 第零步：层数降级前置处理

**目标**：所有涉及层数的产品（分层厂房、分栋厂房、产业大厦、配套宿舍）在正式进入配置计算前，先完成限高检查和降级，降级后的层数作为后续所有步骤的统一输入参数。

**输入**：`projectData.heightLimit`, `selectedProducts`, `productOptions`

---

### 子步骤0.0：分层面积段前置处理（强制双拼转换）

**目标**：在算法开始前，对用户选择的分层面积段中≤800的，先转换为双拼后的面积段，保留原始面积映射关系。

**输入**：`productOptions['layer'].areas`（如 `[600, 1000, 1200]`）

**输出**：`processedAreas`（转换后的面积段数组），`duplexSourceMap`（转换映射关系：{转换后面积: 原始面积}）

**注意**：`processedAreas` 和 `duplexSourceMap` 需要在后续步骤中传递使用：
1. `processedAreas` 在子步骤0.5中更新到 `productOptions['layer'].areas`
2. `duplexSourceMap` 保存为全局变量，供 `createConfigs`（3.5节）和 `convertToDuplex`（3.6节）使用

```
function preprocessLayerAreas(originalAreas):
   duplexSourceMap = {}   // 转换后面积 -> 原始面积
   processedAreas = []
   
   for area in originalAreas:
      if area <= 800:
         convertedArea = area * 2
         duplexSourceMap[convertedArea] = area
         // 不去重：即使convertedArea与原生面积重复，也保留独立条目
         processedAreas.push(convertedArea)
      else:
         processedAreas.push(area)
   
   return {
      areas: processedAreas.sort((a,b)=>a-b),  // 排序但不合并重复
      duplexSourceMap: duplexSourceMap
   }
```

**示例**：
- 用户选 `[600, 800, 1000, 1200]` → 处理后：`[1000, 1200, 1200, 1600]`
  - `duplexSourceMap = {1200: 600, 1600: 800}`
  - 注意：两个1200（一个来自600转换，一个原生）保留为独立条目

---

### 子步骤0.1：分层厂房层数降级

1. 判断是否选择分层厂房：
   - 若 `selectedProducts.has('layer')` 为 false，跳过，`layerFloors = []`

2. 获取用户选择的层数：
   - `originalLayerFloors = productOptions['layer'].floors`（如 `[8, 10]`）

3. 逐层数降级处理：
   - 对 `originalLayerFloors` 中每个 `floor`：
     - `currentFloor = floor`
     - `totalH = 7.2 + 5.1 + 4.5 * (currentFloor - 2) + 1.2`
     - 当 `totalH > heightLimit` 且 `currentFloor > 1` 时循环：
       - `currentFloor--`
       - `totalH = 7.2 + 5.1 + 4.5 * (currentFloor - 2) + 1.2`
     - 若 `totalH <= heightLimit`：
       - 若 `currentFloor >= 5`：`layerFloors.push(currentFloor)`，标记降级状态
       - 若 `currentFloor <= 4`：归类为分栋，不加入 `layerFloors`
     - 若降到1层仍超限：该层数不可用，不加入任何数组

4. 若 `layerFloors` 为空：从 `selectedProducts` 中移除 `'layer'`

---

### 子步骤0.2：分栋厂房层数降级

1. 判断是否选择分栋厂房：
   - 若 `selectedProducts.has('split')` 为 false，跳过，`splitFloors = []`

2. 获取用户选择的层数：
   - `originalSplitFloors = productOptions['split'].floors`（如 `[3.5, 4]`）

3. 逐层数检查：
   - 对 `originalSplitFloors` 中每个 `floor`：
     - 若 `floor == 3.5`：`totalH = 22.5 + 1.2 = 23.7`
     - 否则：`totalH = 7.2 + 5.1 + 4.5 * (floor - 2) + 1.2`
     - 若 `totalH <= heightLimit`：`splitFloors.push(floor)`
     - 否则：该层数超限，不加入（理论上分栋很少超限）

4. 若 `splitFloors` 为空：从 `selectedProducts` 中移除 `'split'`

---

### 子步骤0.3：分层降级为分栋的合并处理

**前置**：在子步骤0.1开始前，保存原始分层面积段：
- `originalLayerAreas = [...productOptions['layer'].areas]`（用户原始选择的面积段，转换前）

1. 初始化降级记录数组：
   - `downgradedFloors = []`（记录所有降级到≤4层的实际层数）
   - `convertedAreas = []`

2. 在子步骤0.1降级循环中，当 `currentFloor <= 4` 时：
   - `downgradedFloors.push(currentFloor)`（记录实际降级后的层数）

3. 若存在分层原始层数降级到 `<= 4` 层：
   - 从 `selectedProducts` 中移除 `'layer'`
   - 若 `selectedProducts` 中无 `'split'`，则加入 `'split'`
   - 面积段合并（取消双拼，还原原始值）：
     - 对 `originalLayerAreas` 中每个 `area`（使用保存的原始值）：
       - 若 `area <= 800`：`convertedAreas.push(round(area / 2 / 50) * 50)`（强制双拼还原为原始值）
       - 否则：`convertedAreas.push(area)`（1000或1200不变）
   - 合并到分栋面积段，去重排序：
     - 若 `selectedProducts.has('split')`：
       - `mergedAreas = [...new Set([...existingSplitAreas, ...convertedAreas])].sort((a,b)=>a-b)`
       - `productOptions['split'].areas = mergedAreas`
     - 否则：`productOptions['split'] = { floors: [], areas: convertedAreas }`
   - 降级层数加入分栋层数，去重排序：
     - `convertedFloors = [...new Set(downgradedFloors)].sort((a,b)=>a-b)`（使用实际降级层数，非硬编码）
     - 若 `selectedProducts.has('split')` 且 `productOptions['split'].floors` 存在：
       - `mergedFloors = [...new Set([...existingSplitFloors, ...convertedFloors])].sort((a,b)=>a-b)`
       - `productOptions['split'].floors = mergedFloors`
     - 否则：`productOptions['split'].floors = convertedFloors`

---

### 子步骤0.4：配套宿舍参考高度上限确定

1. 若选了产业大厦（`towerCfg` 存在）：`referenceHeight = towerCfg.totalHeight`
2. 否则若 `layerFloors.length > 0`：`referenceHeight = 分层厂房降级后的最大高度`
3. 否则：`referenceHeight = projectData.heightLimit`（用户输入限高）

---

### 子步骤0.5：更新全局输入参数

1. 更新 `productOptions`：
   - 若 `selectedProducts.has('layer')`：
     - `productOptions['layer'].areas = processedAreas`（使用0.0节转换后的面积段）
     - `productOptions['layer'].floors = layerFloors`
   - 若 `layerFloors` 为空（全部降级为分栋或不可用）：已从 `selectedProducts` 移除，不更新
   - 保存 `duplexSourceMap` 为全局变量（供后续createConfigs和convertToDuplex使用）

2. 更新高度相关变量：
   - `maxLayerHeight` = 若 `layerFloors` 非空，取最大层数对应高度；否则默认值
   - `minLayerHeight` = 若 `layerFloors` 非空，取最小层数对应高度；否则默认值

3. 输出：
   - 更新后的 `selectedProducts`
   - 更新后的 `productOptions`（含转换后的areas）
   - `duplexSourceMap`（全局变量）
   - `referenceHeight`
   - `maxLayerHeight` / `minLayerHeight`
   - `layerDowngraded`（用于最终输出备注）

---

## 步骤一：产业大厦判断与配置

**输入**：`projectData.rdRatio`, `projectData.landArea`, `projectData.far`, `projectData.heightLimit`, `productOptions['tower'].areas[0]`

---

1. **判断是否选择产业大厦**：
   - 若 `selectedProducts.has('tower')` 且 `rdRatio > 0`：继续步骤2
   - 否则：跳过产业大厦，`towerArea = 0`, `towerBase = 0`, `towerCap = 0`

2. **计算目标面积**：`targetRdArea = landArea * far * rdRatio`

3. **获取用户选择的面积段**：`areaRef = productOptions['tower'].areas[0]`

4. **计算初步层数**：`floors = max(3, ceil(targetRdArea / areaRef))`

5. **计算建筑高度**：`totalH = 6.6 + 4.5 * (floors - 2) + 4.5 + 1.2`

6. **限高检查**：
   - 若 `totalH > heightLimit`：
     - `floors = max(3, floor((heightLimit - 6.6 - 4.5 - 1.2) / 4.5) + 2)`
     - `totalH = 6.6 + 4.5 * (floors - 2) + 4.5 + 1.2`

7. **精确面积段计算**：
   - `exactBase = targetRdArea / floors`
   - `finalBase = floor(exactBase / 50) * 50`
   - `actualArea = finalBase * floors`

8. **偏差检查**：
   - 若 `|actualArea - targetRdArea| / targetRdArea > 0.002`：
     - `finalBase = floor(exactBase / 20) * 20`
     - `actualArea = finalBase * floors`

9. **电梯配置**：`paxLift = max(1, ceil(actualArea / 4000) - 2)`

10. **输出产业大厦配置**：
    - `id: 'tower'`, `type: '产业大厦'`, `base: finalBase`, `unitCap: actualArea`, `floors`, `totalHeight: totalH`, `elevator: paxLift + '客2货'`
    - `towerArea = actualArea`, `towerBase = finalBase`, `towerCap = actualArea`

---

## 步骤二：配套用房判断与配置

**输入**：`projectData.landArea`, `projectData.far`, `projectData.ancillaryRatio`, `projectData.heightLimit`, `selectedProducts`, `productOptions`, `towerCfg`

---

1. **判断是否选择配套用房**：
   - 若 `selectedProducts.has('dorm')` 或 `selectedProducts.has('support')`：继续
   - 否则：跳过，`dormArea=0`, `dormBase=0`, `dormCap=0`, `supportArea=0`, `supportBase=0`, `supportCap=0`

2. **计算配套用房目标面积**：`totalAncillary = landArea * far * ancillaryRatio`

3. **确定参考高度上限**（来自第零步）：`referenceHeight`

---

### 情况A：`totalAncillary <= 2400`

**UI允许**：仅配套楼 / 仅配套宿舍 / 配套楼+配套宿舍

#### A1. 若仅选了配套楼（未选配套宿舍）

1. 若 `totalAncillary < 1200`：
   - `supportFloors = 2`, `totalH = 7.2 + 4.5 + 1.2 = 12.9`
2. 否则：
   - `supportFloors = 3`, `totalH = 7.2 + 5.1 + 4.5 + 1.2 = 18.3`
3. `exactBase = totalAncillary / supportFloors`
4. `supportBase = floor(exactBase / 50) * 50`
5. `finalSupportCap = supportBase * supportFloors`
6. 若 `|finalSupportCap - totalAncillary| / totalAncillary > 0.002`：
   - `supportBase = floor(exactBase / 20) * 20`
   - `finalSupportCap = supportBase * supportFloors`
7. 输出配套楼配置，无配套宿舍

#### A2. 若仅选了配套宿舍（未选配套楼）

- 执行子流程：仅配套宿舍（见下方）

#### A3. 若同时选了配套楼和配套宿舍

- 执行子流程：配套楼+配套宿舍（见下方）

---

### 情况B：`totalAncillary > 2400`

**UI强制**：必须选配套宿舍，配套楼可选

#### B1. 若选了配套楼和配套宿舍

- 执行子流程：配套楼+配套宿舍（见下方）

#### B2. 若仅选了配套宿舍（未选配套楼）

- `dormCap = totalAncillary`
- 执行子流程：仅配套宿舍（见下方）

---

### 子流程：配套楼+配套宿舍

1. **前置检查**：
   - 若 `totalAncillary < 1200 + 1200`（配套楼最小2层+宿舍最小2层×600）**：
     - 配套楼和宿舍无法同时配置，报错或自动取消配套楼（按仅配套宿舍处理）

2. **配套楼分配**（按 totalAncillary 范围直接判断）：
   - 若 `totalAncillary < 1200`：`finalSupportCap = totalAncillary`, `supportFloors = 2`, `supportBase = floor(totalAncillary / 2 / 50) * 50`
   - 若 `totalAncillary < 2400`：`finalSupportCap = totalAncillary`, `supportFloors = 3`, `supportBase = floor(totalAncillary / 3 / 50) * 50`
   - 若 `totalAncillary < 3600`：`finalSupportCap = 1200`, `supportFloors = 3`, `supportBase = 400`
   - 若 `totalAncillary >= 3600`：`finalSupportCap = 2400`, `supportFloors = 3`, `supportBase = 800`

3. **输出配套楼**：
   - 若 `supportFloors == 2`：`totalH = 7.2 + 4.5 + 1.2 = 12.9`
   - 若 `supportFloors == 3`：`totalH = 7.2 + 5.1 + 4.5 + 1.2 = 18.3`

4. **配套宿舍目标面积**：`dormCap = totalAncillary - finalSupportCap`

5. **执行配套宿舍配置流程**（见下方）

---

### 子流程：仅配套宿舍

1. **宿舍目标面积**：`dormCap = totalAncillary`

2. **层数估算**：`estFloors = max(2, floor((referenceHeight - 4.8 - 1.2) / 3.6) + 1)`

3. **初步基底**：
   - `singleArea = dormCap / estFloors`
   - 若 `singleArea < 600`：`base = 600`
   - 若 `singleArea > 1200`：`base = 1200`
   - 否则：`base = round(singleArea / 100) * 100`

4. **层数确定**：`floors = max(2, ceil(dormCap / base))`

5. **建筑高度**：`totalH = 4.8 + 3.6 * (floors - 2) + 1.2`

6. **高度检查（两次调整）**：
   - 若 `totalH > referenceHeight`：
     - `totalH = 4.8 + 3.3 * (floors - 2) + 1.2`
     - 若 `totalH > referenceHeight`：
       - `floors = max(2, floor((referenceHeight - 4.8 - 1.2) / 3.3) + 2)`
       - `totalH = 4.8 + 3.3 * (floors - 2) + 1.2`

7. **最终基底**：
   - `exactBase = dormCap / floors`
   - `finalBase = floor(exactBase / 20) * 20`

8. **输出配套宿舍**：`dormArea = finalBase * floors`, `dormBase = finalBase`, `dormCap = finalBase * floors`

---

## 步骤三：分类表分类与厂房预处理（FL固化）

**输入**：`selectedProducts`（已更新）, `productOptions`（已更新）, `targetBase`, `targetCap`, `heightLimit`, `fixedProducts`

---

### 子步骤3.1：确定厂房类型和层数组合

1. 收集当前厂房类型：
   - `hasLightSteel = selectedProducts.has('light-steel')`
   - `hasSplit = selectedProducts.has('split')`
   - `hasLayer = selectedProducts.has('layer')`

2. 收集各类型层数：
   - `lightSteelFloors = [2.1]`（轻钢等效层数固定）
   - `splitFloors = hasSplit ? productOptions['split'].floors : []`
   - `layerFloors = hasLayer ? productOptions['layer'].floors : []`

3. 统计层数类型总数：`totalLayerTypes = splitFloors.length + layerFloors.length`

---

### 子步骤3.2：分类判断

#### 分类一：无厂房类型
- `bhConfigs = []`, `blConfigs = []`
- `remainingBase = targetBase - fixedBase`
- `remainingCap = targetCap - fixedCap`

#### 分类二：单一厂房类型

- **仅轻钢**：`bhConfigs = createLightSteelConfigs()`, `blConfigs = []`
- **仅分栋**：
  - 1种层数：`bhConfigs = createSplitConfigs(splitFloors[0])`, `blConfigs = []`
  - 2种层数：`bhConfigs = createSplitConfigs(max(splitFloors))`, `blConfigs = createSplitConfigs(min(splitFloors))`
- **仅分层**：
  - 1种层数：`bhConfigs = createLayerConfigs(layerFloors[0])`, `blConfigs = []`
  - 2种层数：`bhConfigs = createLayerConfigs(max(layerFloors))`, `blConfigs = createLayerConfigs(min(layerFloors))`

#### 分类三：两种厂房类型

- **轻钢 + 分栋**：`bhFloor = max(2.1, splitFloors[0])`, `blFloor = min(2.1, splitFloors[0])`
- **轻钢 + 分层**：`bhFloor = max(2.1, layerFloors[0])`, `blFloor = min(2.1, layerFloors[0])`
- **分栋 + 分层**：`bhFloor = max(splitFloors[0], layerFloors[0])`, `blFloor = min(splitFloors[0], layerFloors[0])`

#### 分类四：三种厂房类型（轻钢 + 分栋 + 分层）

- 强制分配1栋最低层数最小面积分层
- 剩余退化为分栋+轻钢（二类问题）

---

### 子步骤3.3：FL预处理（多种层数固化为2种）

**目标**：当 `totalLayerTypes > 2` 时，循环FL预处理直到 `<= 2`

```
while totalLayerTypes > 2:
   
   // 确定本次预处理的类型（优先分层，其次分栋）
   if layerFloors.length > 1:
      preprocessType = 'layer'
      preprocessFloors = layerFloors
   else if splitFloors.length > 1:
      preprocessType = 'split'
      preprocessFloors = splitFloors
   else:
      break
   
   // 计算FL值
   maxFloor = max(preprocessFloors)
   maxArea = max(productOptions[preprocessType].areas)
   
   if preprocessType == 'layer':
      a = maxArea * maxFloor
      FL = (landArea * far) / a / 2
   else:
      a = maxArea * maxFloor
      FL = (landArea * far) / a
   
   // 避免过度固化：FL<1表示固化配置的总面积已超过目标计容面积
   if FL < 1:
      break
   
   // 分配固定厂房（简化：各面积段各1栋最高层数）
   for each area in productOptions[preprocessType].areas:
      if preprocessType == 'layer' and area <= 800:
         base = area * 2  // 强制双拼（含丰富面积段后≤800）
      else:
         base = area
      
      floors = maxFloor
      totalH = 7.2 + 5.1 + 4.5 * (floors - 2) + 1.2
      unitCap = base * floors
      
      fixedConfigs.push({
         id: preprocessType,
         type: preprocessType == 'layer' ? '分层厂房' : '分栋厂房',
         base, unitCap, floors, totalHeight: totalH,
         count: 1, isFixed: true
      })
      
      usedBase += base
      usedCap += unitCap
   
   // 移除已固化的最高层数
   preprocessFloors = preprocessFloors.filter(f => f != maxFloor)
   
   // 更新层数类型计数
   if preprocessType == 'layer':
      layerFloors = preprocessFloors
   else:
      splitFloors = preprocessFloors
   
   totalLayerTypes = splitFloors.length + layerFloors.length
```

---

### 子步骤3.4：三种厂房类型处理

1. **固定1栋最低层数最小面积分层**：
   - `minLayerFloor = min(layerFloors)`
   - `minLayerArea = min(productOptions['layer'].areas)`
   - 若 `minLayerArea <= 800`：`base = minLayerArea * 2`，否则 `base = minLayerArea`
   - `floors = minLayerFloor`
   - `totalH = 7.2 + 5.1 + 4.5 * (floors - 2) + 1.2`
   - `unitCap = base * floors`
   - 加入 `fixedConfigs`

2. **剩余退化为分栋+轻钢**：
   - 若 `splitFloors.length > 1`：FL预处理分栋
   - 否则：直接确定Bh/Bl（分栋 vs 轻钢）

---

### 子步骤3.5：创建配置数组

```
function createConfigs(type, floor):
   configs = []
   areas = productOptions[type].areas
   
   for each area in areas:
      if type == 'layer':
         // 从duplexSourceMap判断是否是转换来的面积段
         sourceArea = duplexSourceMap[area] || null
         if sourceArea != null:
            // 来自600/800转换：base已经是双拼后的值（1200/1600）
            base = area
            duplexSource = sourceArea  // 600或800
         else:
            // 原生面积段（1000/1200）
            base = area
            duplexSource = null
      else:
         base = area
         duplexSource = null
      
      if type == 'light-steel':
         unitCap = base * 2 + 200  // 轻钢按独栋计容（基底×2+200）
         totalH = 13.2
      else if type == 'split' and floor == 3.5:
         unitCap = base * 3.5
         totalH = 22.5 + 1.2
      else:
         unitCap = base * floor
         totalH = 7.2 + 5.1 + 4.5 * (floor - 2) + 1.2
      
      configs.push({
         id: type, type: typeName, base, unitCap,
         originalArea: area,           // 算法中使用的面积（可能是转换后的）
         duplexSource: duplexSource,     // 强制双拼的原始面积（600/800），原生为null
         floors: floor, totalHeight: totalH, isLow: type != 'layer'
      })
   
   return configs
```

---

### 子步骤3.6：双拼转换（最终输出时执行）

**目标**：算法推导全程按独栋计算，最终输出时将偶数栋转为双拼。

**输入**：`counts`, `configs`

**输出**：`convertedOutput`（含独栋/双拼栋数）

```
function convertToDuplex(counts, configs):
   output = []
   
   for i from 0 to configs.length - 1:
      c = configs[i]
      count = counts[i]
      
      if count <= 0: continue
      
      sourceArea = c.duplexSource  // 强制双拼的原始面积（如600），原生为null
      
      // 情况1：分层且来自<=800的强制双拼（如1200来自600）
      if c.id == 'layer' and sourceArea != null:
         if count % 2 == 0:
            output.push({
               type: c.type,
               displayBase: sourceArea,        // 显示原始面积600
               actualBase: c.base,              // 实际基底1200
               floors: c.floors,
               count: count / 2,
               isDuplex: true,
               note: sourceArea + '+' + sourceArea + '双拼'
            })
         else:
            duplexCount = floor(count / 2)
            if duplexCount > 0:
               output.push({
                  type: c.type,
                  displayBase: sourceArea,
                  actualBase: c.base,
                  floors: c.floors,
                  count: duplexCount,
                  isDuplex: true,
                  note: sourceArea + '+' + sourceArea + '双拼'
               })
            output.push({
               type: c.type,
               displayBase: sourceArea,
               actualBase: sourceArea,  // 独栋用原始面积
               floors: c.floors,
               count: 1,
               isDuplex: false,
               note: sourceArea + '独栋'
            })
      
      // 情况2：分层原生>=1000面积段（1000, 1200原生）
      else if c.id == 'layer':
         if count % 2 == 0:
            output.push({
               type: c.type,
               displayBase: c.base,
               actualBase: c.base * 2,
               floors: c.floors,
               count: count / 2,
               isDuplex: true,
               note: c.base + '+' + c.base + '双拼'
            })
         else:
            duplexCount = floor(count / 2)
            if duplexCount > 0:
               output.push({
                  type: c.type,
                  displayBase: c.base,
                  actualBase: c.base * 2,
                  floors: c.floors,
                  count: duplexCount,
                  isDuplex: true,
                  note: c.base + '+' + c.base + '双拼'
               })
            output.push({
               type: c.type,
               displayBase: c.base,
               actualBase: c.base,
               floors: c.floors,
               count: 1,
               isDuplex: false,
               note: c.base + '独栋'
            })
      
      // 情况3：非分层类型（轻钢、分栋）—— 原有逻辑不变
      else:
         if count % 2 == 0:
            output.push({
               type: c.type,
               displayBase: c.base,
               actualBase: c.base * 2,
               floors: c.floors,
               count: count / 2,
               isDuplex: true,
               note: '双拼'
            })
         else:
            duplexCount = floor(count / 2)
            if duplexCount > 0:
               output.push({
                  type: c.type,
                  displayBase: c.base,
                  actualBase: c.base * 2,
                  floors: c.floors,
                  count: duplexCount,
                  isDuplex: true,
                  note: '双拼'
               })
            output.push({
               type: c.type,
               displayBase: c.base,
               actualBase: c.base,
               floors: c.floors,
               count: 1,
               isDuplex: false,
               note: '独栋'
            })
   
   return output
```

**注意**：双拼转换仅影响最终输出表格，不影响算法推导过程中的计容面积和基底面积计算。

---

## 步骤四：Bh/Bl核心算法（遍历优化）

**输入**：`bhConfigs`, `blConfigs`, `remainingBase`, `remainingCap`, `landArea`

---

### 子步骤4.1：计算平均效率

- `effBh = bhConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / bhConfigs.length`
- `effBl = blConfigs.reduce((s, c) => s + c.unitCap / c.base, 0) / blConfigs.length`
- `avgEff = remainingCap / remainingBase`

---

### 子步骤4.2：解方程确定Bh/Bl占地分配

方程：`x + y = remainingBase`, `effBh*x + effBl*y = remainingCap`

- **正常分配**（`avgEff > effBl + EPS` 且 `avgEff < effBh - EPS`）：
  - `targetCapBh = effBh * x`, `targetCapBl = effBl * y`
  - `targetBaseBh = x`, `targetBaseBl = y`

- **取消Bl**（`avgEff >= effBh - EPS`）：
  - `targetCapBh = remainingCap`, `targetCapBl = 0`
  - `targetBaseBh = remainingBase`, `targetBaseBl = 0`

- **取消Bh**（`avgEff <= effBl + EPS`）：
  - `targetCapBh = 0`, `targetCapBl = remainingCap`
  - `targetBaseBh = 0`, `targetBaseBl = remainingBase`

- **边界情况**：按效率比例分配

其中 `EPS = 1e-9`（浮点精度保护）

---

### 子步骤4.3：整数方程求解（solveIntegerEquation）

```
function solveIntegerEquation(targetCap, configs, targetBaseLimit):
   
   // 统一空值/零值判断
   const hasBaseLimit = targetBaseLimit != null && targetBaseLimit > 0;
   
   k = configs.length
   
   if k == 1:
      c = configs[0]
      n = max(1, round(targetCap / c.unitCap))
      bestN = n, bestDiff = Infinity
      for dn from -1 to 1:
         testN = max(1, n + dn)
         testCap = c.unitCap * testN
         testBase = c.base * testN
         if hasBaseLimit and testBase > targetBaseLimit: continue
         diff = abs(testCap - targetCap)
         if diff < bestDiff:
            bestDiff = diff
            bestN = testN
      return { counts: [bestN], totalCap: c.unitCap * bestN, totalBase: c.base * bestN }
   
   // 多配置：DFS遍历搜索
   best = null, bestScore = Infinity
   
   function dfs(idx, current, currentCap, currentBase):
      if idx == k - 1:
         c = configs[idx]
         n = max(0, round((targetCap - currentCap) / c.unitCap))
         for dn from -15 to 15:
            nn = max(0, n + dn)
            tc = currentCap + c.unitCap * nn
            tb = currentBase + c.base * nn
            if hasBaseLimit and tb > targetBaseLimit: continue
            
            // 剪枝：超界剪枝
            if hasBaseLimit and currentBase > targetBaseLimit * 1.2: return
            if currentCap > targetCap * 1.5: return
            
            diff = abs(tc - targetCap)
            allCounts = [...current, nn]
            nonZeroCount = allCounts.filter(x => x > 0).length
            penalty = (k >= 2 and nonZeroCount < 2) ? 50000 : 0
            densityPenalty = hasBaseLimit ? abs(tb - targetBaseLimit) * 0.001 : 0
            farReward = diff < targetCap * 0.0001 ? -1000 : 0
            score = diff + penalty + densityPenalty + farReward
            
            if score < bestScore:
               bestScore = score
               best = [...current, nn]
         return
      
      c = configs[idx]
      n = max(0, round((targetCap - currentCap) / c.unitCap))
      for dn from -15 to 15:
         nn = max(0, n + dn)
         // 剪枝：超界剪枝
         nextBase = currentBase + c.base * nn
         nextCap = currentCap + c.unitCap * nn
         if hasBaseLimit and nextBase > targetBaseLimit * 1.2: continue
         if nextCap > targetCap * 1.5: continue
         dfs(idx + 1, [...current, nn], nextCap, nextBase)
   
   dfs(0, [], 0, 0)
   
   if not best:
      // fallback：用最小面积段
      sortedConfigs = [...configs].sort((a, b) => a.base - b.base)
      minBase = sortedConfigs[0].base
      maxN = hasBaseLimit ? floor(targetBaseLimit / minBase) : 100
      if maxN <= 0:
         // 无法分配，返回空解
         return { counts: configs.map(() => 0), totalCap: 0, totalBase: 0 }
      bestN = max(1, min(maxN, round(targetCap / sortedConfigs[0].unitCap)))
      bestDiff = Infinity
      for n from 1 to maxN:
         tc = sortedConfigs[0].unitCap * n
         diff = abs(tc - targetCap)
         if diff < bestDiff:
            bestDiff = diff
            bestN = n
      result = configs.map(() => 0)
      minIdx = configs.indexOf(sortedConfigs[0])
      result[minIdx] = bestN
      return { counts: result, totalCap: sortedConfigs[0].unitCap * bestN, totalBase: sortedConfigs[0].base * bestN }
   
   totalCap = 0, totalBase = 0
   configs.forEach((c, i) => { totalCap += c.unitCap * best[i]; totalBase += c.base * best[i] })
   return { counts: best, totalCap, totalBase }
```

---

### 子步骤4.4：Bh和Bl分别求解

- Bh求解：`bhResult = solveIntegerEquation(targetCapBh, bhConfigs, targetBaseBh * 1.05)`
- Bl求解：`blResult = solveIntegerEquation(targetCapBl, blConfigs, targetBaseBl * 1.05)`
- 合并：`finalCounts = [...bhResult.counts, ...blResult.counts]`

---

### 子步骤4.5：Bh/Bl取消判断

- `bhCount = finalCounts.slice(0, bhConfigs.length).reduce((a, b) => a + b, 0)`
- `blCount = finalCounts.slice(bhConfigs.length).reduce((a, b) => a + b, 0)`

- 若 `bhCount == 0` 且 `blCount > 0`：取消Bh，只用Bl
- 若 `blCount == 0` 且 `bhCount > 0`：取消Bl，只用Bh
- 否则：同时保留Bh和Bl

---

## 步骤五：外层循环（runOuterLoop）

**输入**：`finalCounts`, `bhConfigs`, `blConfigs`, `fixedFactoryConfigs`, `remainingBase`, `remainingCap`, `landArea`, `far`, `density`, `targetBase`, `targetCap`, `fixedProductsBase`, `fixedProductsCap`, `isSingleType`

---

### 子步骤5.0：振荡检测初始化（循环外层）

```
// 振荡检测：在runOuterLoop循环外层初始化，跨轮次保留历史
oscillationHistory = []  // 存储最近5轮的密度偏差符号（+1: 超上限, -1: 低于下限, 0: 正常）

function detectOscillation():
   if oscillationHistory.length < 3: return false
   // 若最近3轮出现 +1, -1, +1 或 -1, +1, -1 的交替模式，判定为振荡
   last3 = oscillationHistory.slice(-3)
   return (last3[0] > 0 && last3[1] < 0 && last3[2] > 0) ||
          (last3[0] < 0 && last3[1] > 0 && last3[2] < 0)
```

---

### 子步骤5.1：初始状态计算

- `totals = calcCounts(finalCounts, bhConfigs, blConfigs, fixedFactoryConfigs)`
- `totals.base += fixedProductsBase`
- `totals.cap += fixedProductsCap`
- `CAP_LO = targetCap * 0.995`, `CAP_HI = targetCap * 1.005`

---

### 子步骤5.2：分布均衡性检查

```
function checkDistribution(counts, configs):
   typeGroups = { 'light-steel': {indices: [], totalCount: 0}, 'split': {indices: [], totalCount: 0}, 'layer': {indices: [], totalCount: 0} }
   allConfigs = [...bhConfigs, ...blConfigs]
   allConfigs.forEach((c, i) => {
      if counts[i] > 0:
         typeGroups[c.id].indices.push(i)
         typeGroups[c.id].totalCount += counts[i]
   })
   
   // 始终返回完整字段，避免后续访问undefined
   for each type in ['light-steel', 'split', 'layer']:
      group = typeGroups[type]
      if group.totalCount < 5: continue
      if group.indices.length === 0: continue
      for each idx in group.indices:
         areaCount = counts[idx]
         rest = group.totalCount - areaCount
         if areaCount > rest * 2:
            return {
               needsOptimization: true,
               type,
               a: min(group.indices.map(i => configs[i].base)),
               b: max(group.indices.map(i => configs[i].base)),
               eff: configs[group.indices[0]].unitCap / configs[group.indices[0]].base
            }
   
   // 不需要优化时，返回主要类型信息（用于振荡检测场景）
   dominantType = null
   dominantCount = 0
   for each type in ['light-steel', 'split', 'layer']:
      if typeGroups[type].totalCount > dominantCount:
         dominantCount = typeGroups[type].totalCount
         dominantType = type
   
   // 获取主要类型的minBase/maxBase/eff
   if dominantType and typeGroups[dominantType].indices.length > 0:
      dIndices = typeGroups[dominantType].indices
      return {
         needsOptimization: false,
         type: dominantType,
         a: min(dIndices.map(i => configs[i].base)),
         b: max(dIndices.map(i => configs[i].base)),
         eff: configs[dIndices[0]].unitCap / configs[dIndices[0]].base
      }
   
   return { needsOptimization: false, type: null, a: null, b: null, eff: null }
```

---

### 子步骤5.3：优化分布（含振荡检测）

```
// 先记录本轮密度偏差方向（在检测前记录，确保历史数据可用）
densityDiff = totals.base - targetBase
if densityDiff > targetBase * 0.05: oscillationHistory.push(1)
else if densityDiff < -targetBase * 0.05: oscillationHistory.push(-1)
else: oscillationHistory.push(0)
// 只保留最近5轮记录
if oscillationHistory.length > 5: oscillationHistory.shift()

// 然后检测分布和振荡
distCheck = checkDistribution(finalCounts, [...bhConfigs, ...blConfigs])

if distCheck.needsOptimization or detectOscillation():
   type = distCheck.type
   a = distCheck.a
   b = distCheck.b
   eff = distCheck.eff
   
   typeIndices = allConfigs.map((c, i) => i).filter(i => allConfigs[i].id === type)
   S = typeIndices.reduce((sum, i) => sum + allConfigs[i].base * finalCounts[i], 0)
   
   if isSingleType:
      // 先丰富面积段
      enrichedConfigs = enrichConfigs(type === 'layer' ? bhConfigs : blConfigs, landArea)
      newCounts = solveIntegerEquation(
         type === 'layer' ? targetCapBh : targetCapBl,
         enrichedConfigs,
         type === 'layer' ? targetBaseBh * 1.05 : targetBaseBl * 1.05
      )
      
      if type === 'layer': currentBhConfigs = enrichedConfigs
      else: currentBlConfigs = enrichedConfigs
      counts = newCounts
      
      totals = calcTotals(counts, currentBhConfigs, currentBlConfigs, fixedFactoryConfigs)
      totals.base += fixedProductsBase
      totals.cap += fixedProductsCap
      
      // 丰富后仍不满足或检测到振荡，直接手动分配
      distCheck2 = checkDistribution(counts, [...currentBhConfigs, ...currentBlConfigs])
      if distCheck2.needsOptimization or detectOscillation():
         optimized = manualDistribute(S, a, b, eff)
         // 映射回counts...
         // 用optimized结果替换原counts中对应type的配置
         // 重新计算totals
   else:
      // Bh/Bl同时存在，直接手动分配（振荡时跳过遍历，直接手动分配）
      optimized = manualDistribute(S, a, b, eff)
      // 映射回counts...
      // 用optimized结果替换原counts中对应type的配置
      // 重新计算totals
```

---

### 子步骤5.4：手动分配算法（manualDistribute）

```
function manualDistribute(S, a, b, eff):
   
   // 极端情况：S < b
   if S < b:
      base = ROUNDUP(S / 10, 0) * 10
      return [{ base, count: 1, unitCap: base * eff }]
   
   // 计算参考栋数
   refCount = ROUNDUP(S * 2 / (a + b), 0)
   
   // 类别A：refCount <= 3
   if refCount <= 3:
      unifiedBase = ROUNDUP(S / refCount / 10, 0) * 10
      return [{ base: unifiedBase, count: refCount, unitCap: unifiedBase * eff }]
   
   // 类别B：3 < refCount <= 6
   else if refCount <= 6:
      aa = Math.max(1, ROUNDUP(refCount * 2 / 3, 0) - 2)  // 保护：确保aa>=1
      bb = 1
      cc = refCount - aa - bb
      
      if cc <= 0:
         // 退化到统一分配
         unifiedBase = ROUNDUP(S / refCount / 10, 0) * 10
         return [{ base: unifiedBase, count: refCount, unitCap: unifiedBase * eff }]
      
      aBase = a * aa
      bBase = b * bb
      S1 = aBase + bBase
      remaining = S - S1
      
      c = ROUNDUP(remaining / cc / 10, 0) * 10
      
      return [
         { base: a, count: aa, unitCap: a * eff },
         { base: c, count: cc, unitCap: c * eff },
         { base: b, count: bb, unitCap: b * eff }
      ]
   
   // 类别C：refCount > 6
   else:
      aa = Math.max(1, ROUNDUP(refCount * 2 / 3, 0) - 2)  // 保护：确保aa>=1
      bb = 2
      
      aBase = a * aa
      bBase = b * bb
      S1 = aBase + bBase
      remaining = S - S1
      
      if remaining <= 0:
         // S刚好分配完毕，无需中间面积段
         return [
            { base: a, count: aa, unitCap: a * eff },
            { base: b, count: bb, unitCap: b * eff }
         ]
      
      cRef = (a + b) / 2
      cc = Math.max(1, ROUNDUP(remaining / cRef, 0))  // 保护：确保cc>=1
      c = ROUNDUP(remaining / cc / 10, 0) * 10
      
      return [
         { base: a, count: aa, unitCap: a * eff },
         { base: c, count: cc, unitCap: c * eff },
         { base: b, count: bb, unitCap: b * eff }
      ]
```

---

### 子步骤5.5：丰富面积段（enrichConfigs）

**目标**：当遍历算法后最优解仍无法满足容积率允许误差（farDiff > 0.0001）时，通过增加面积段选项来扩大搜索空间，重新求解。

**输入**：`configs`（当前配置数组，如bhConfigs或blConfigs），`landArea`（用地面积S）

**输出**：`enrichedConfigs`（增加面积段后的新配置数组）

---

#### 5.5.1 确定增加上限

根据用地面积S确定可增加面积段数量：

```
if landArea <= 20000:
   maxAdd = 1
else if landArea <= 50000:
   maxAdd = 2
else:
   maxAdd = 3
```

#### 5.5.2 生成新增面积段

对 `configs` 中每个现有配置，按以下方法生成候选面积段：

**方法1：递减法**
- 对现有面积段 `x`：
  - `x - 50`（若 x - 50 >= 最小允许面积段）
  - `x + 50`（若 x + 50 <= 最大允许面积段）
  - `x - 100`（若 x - 100 >= 最小允许面积段）

**方法2：内插法**
- 对相邻两个面积段 `x1` 和 `x2`（x1 < x2）：
  - `mid = round((x1 + x2) / 2 / 50) * 50`（取最接近的50倍数）
  - 若 `mid != x1` 且 `mid != x2`：加入候选

**面积段边界约束**：
- 分栋厂房：最小300，最大1200
- 分层厂房：最小600，最大1200
- 轻钢厂房：最小1000，最大4000

#### 5.5.3 过滤和排序

1. **取整**：所有候选面积段必须是50的倍数
2. **去重**：候选面积段不能与已有面积段重复
3. **排序**：按与目标效率的接近程度排序（优先保留接近目标效率的面积段）
   - `targetEff = targetCap / targetBase`（目标效率）
   - 对每个候选面积段，计算其效率：
     - 若 `type == 'layer'` 且 `duplexSourceMap[area] != null`（来自600/800转换）：
       - `originalArea = duplexSourceMap[area]`（原始面积600/800）
       - `eff = originalArea * floor / area`（用原始面积和转换后base计算）
     - 否则：
       - `eff = area * floor / area = floor`（原生面积段，效率=层数）
   - 按 `|eff - targetEff|` 从小到大排序
4. **截断**：只保留前 `maxAdd` 个候选面积段

**注意**：若排序后前 `maxAdd` 个候选面积段全部偏小或偏大，可调整为保留两端各一半（小面积段和大面积段各取一部分），以确保面积段分布均衡。

#### 5.5.4 创建新配置

对每个新增面积段，创建对应的配置对象：

```
function createEnrichedConfig(type, area, floor):
   if type == 'layer' and area <= 800:
      base = area * 2  // 强制双拼（含新增面积段<=800）
   else:
      base = area
   
   if type == 'light-steel':
      unitCap = base * 2 + 200
      totalH = 13.2
   else if type == 'split' and floor == 3.5:
      unitCap = base * 3.5
      totalH = 22.5 + 1.2
   else:
      unitCap = base * floor
      totalH = 7.2 + 5.1 + 4.5 * (floor - 2) + 1.2
   
   return {
      id: type,
      type: typeName,
      base,
      unitCap,
      floors: floor,
      totalHeight: totalH,
      isEnriched: true  // 标记为丰富面积段新增
   }
```

#### 5.5.5 合并输出

```
enrichedConfigs = [...configs, ...newConfigs]
// 按base从小到大排序
enrichedConfigs.sort((a, b) => a.base - b.base)
```

#### 5.5.6 触发检查与重新求解

```
farDiff = abs(totals.cap - targetCap) / targetCap

if farDiff > 0.0001:
   // 触发丰富面积段
   enrichedConfigs = enrichConfigs(bhConfigs, landArea)  // 或blConfigs
   newCounts = solveIntegerEquation(targetCap, enrichedConfigs, targetBaseLimit)
   
   // 重新计算totals
   totals = calcTotals(newCounts, enrichedConfigs, ...)
   
   // 再次检查分布均衡性
   distCheck = checkDistribution(newCounts, enrichedConfigs)
   if distCheck.needsOptimization:
      // 丰富面积段后仍不满足，触发手动分配
      optimized = manualDistribute(S, a, b, eff)
```

---

### 子步骤5.6：精细调节（±0.01%）

**目标**：在粗调完成后，通过微调各配置的栋数，使容积率偏差进一步缩小到±0.01%以内。

**输入**：`counts`, `configs`, `targetCap`, `targetBase`, `fixedProductsBase`, `fixedProductsCap`

**输出**：`fineTunedCounts`, `fineTunedTotals`

---

#### 5.6.1 调节策略

```
function fineTune(counts, configs, targetCap, targetBase):
   MAX_FINE_TUNE = 10
   
   for round from 1 to MAX_FINE_TUNE:
      totals = calcTotals(counts, configs)
      totals.base += fixedProductsBase
      totals.cap += fixedProductsCap
      
      farDiff = totals.cap - targetCap
      densityDiff = totals.base - targetBase
      
      // 若容积率已满足±0.01%且密度在±5%内，停止
      if abs(farDiff) <= targetCap * 0.0001 and abs(densityDiff) <= targetBase * 0.05:
         break
      
      // 若密度超限（>5%），停止调节（密度优先级高于容积率精度）
      if abs(densityDiff) > targetBase * 0.05:
         // 回退到上一轮的counts
         if previousCounts: counts = previousCounts
         break
      
      // 选择调节对象：优先调节unitCap与base比值最接近目标效率的配置
      targetEff = targetCap / targetBase
      bestIdx = -1, bestScore = Infinity
      for i from 0 to configs.length - 1:
         if counts[i] <= 0: continue
         eff = configs[i].unitCap / configs[i].base
         score = abs(eff - targetEff)
         if score < bestScore:
            bestScore = score
            bestIdx = i
      
      if bestIdx < 0: break  // 无可调节对象
      
      // 保存当前状态（用于回退）
      previousCounts = [...counts]
      
      // 调节方向：容积率偏低则增加栋数，偏高则减少栋数
      if farDiff > 0:  // 容积率偏高，减少栋数
         if counts[bestIdx] > 1:
            counts[bestIdx]--
      else:  // 容积率偏低，增加栋数
         counts[bestIdx]++
      
      // 检查密度是否超限
      newTotals = calcTotals(counts, configs)
      newTotals.base += fixedProductsBase
      if newTotals.base > targetBase * 1.05:
         // 密度超限，回退
         counts = previousCounts
         break
   
   return { counts, totals }
```

#### 5.6.2 终止条件

- 容积率偏差 ≤ ±0.01%
- 密度偏差 ≤ ±5%
- 达到最大调节轮数（MAX_FINE_TUNE = 10）
- 密度超限时回退并停止
- 无可调节对象时停止

#### 5.6.3 回退机制

每轮调节前保存当前counts状态。若本轮调节导致密度超限，则回退到上一轮状态并停止调节。确保最终输出不会违反密度约束。

---

## 输出

- `counts`：各配置的栋数数组
- `bhConfigs`：有效的Bh配置数组
- `blConfigs`：有效的Bl配置数组
- `totals`：总基底和总计容
