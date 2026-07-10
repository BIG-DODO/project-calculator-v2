// 场景测试脚本 - 测试11组场景
const fs = require('fs');

// 读取算法文件
const algorithmCode = fs.readFileSync('./product-config-algorithm-v2.js', 'utf8');

// 模拟全局环境
function runScenario(name, projectData, selectedProductsArr, productOptions) {
  // 创建真正的Set
  const selectedProducts = new Set(selectedProductsArr);
  
  // 将Set和对象绑定到全局
  global.projectData = projectData;
  global.selectedProducts = selectedProducts;
  global.productOptions = JSON.parse(JSON.stringify(productOptions));
  
  // 使用eval加载算法（仅用于测试）
  eval(algorithmCode);
  
  console.log(`\n=== 场景: ${name} ===`);
  console.log(`参数: S=${projectData.landArea}, F=${projectData.far}, Hl=${projectData.heightLimit}, R2=${projectData.ancillaryRatio}, R1=${projectData.rdRatio}`);
  console.log(`选择产品: ${[...selectedProducts].join(', ')}`);
  
  try {
    // 输入验证
    const errors = validateInput(projectData, selectedProducts, global.productOptions);
    if (errors.length > 0) {
      console.log('验证失败:', errors);
      return null;
    }
    
    // 计算配置
    const result = calculateProductConfig();
    
    if (!result || result.length === 0) {
      console.log('无配置输出');
      return null;
    }
    
    // 计算汇总
    let totalBase = 0, totalCap = 0;
    console.log('配置详情:');
    result.forEach((item, i) => {
      const itemBase = (item.actualBase || item.base) * item.count;
      const itemCap = item.unitCap * item.count;
      totalBase += itemBase;
      totalCap += itemCap;
      console.log(`  ${i+1}. ${item.type} ${item.productType || ''}: ${item.count}栋, 基底=${item.base}, 计容=${item.unitCap}, 总基底=${itemBase}, 总计容=${itemCap}`);
    });
    
    const targetBase = projectData.landArea * (projectData.far < 1.5 ? 0.45 : (projectData.far < 2.0 ? 0.42 : 0.40));
    const targetCap = projectData.landArea * projectData.far;
    
    console.log('汇总:');
    console.log(`  目标基底: ${targetBase.toFixed(0)}, 实际基底: ${totalBase.toFixed(0)}, 偏差: ${((totalBase-targetBase)/targetBase*100).toFixed(2)}%`);
    console.log(`  目标计容: ${targetCap.toFixed(0)}, 实际计容: ${totalCap.toFixed(0)}, 偏差: ${((totalCap-targetCap)/targetCap*100).toFixed(2)}%`);
    
    return { totalBase, totalCap, targetBase, targetCap };
  } catch (e) {
    console.log('错误:', e.message);
    console.log(e.stack);
    return null;
  }
}

// 场景0: 纯轻钢，无配套
runScenario('场景0-纯轻钢', 
  { landArea: 45000, far: 1.0, heightLimit: 20, ancillaryRatio: 0, rdRatio: 0 },
  ['light-steel'],
  { 'light-steel': { areas: [2000, 3000] } }
);

// 场景1: 轻钢+分栋+配套楼+配套宿舍
runScenario('场景1-轻钢分栋配套',
  { landArea: 50000, far: 1.2, heightLimit: 30, ancillaryRatio: 0.15, rdRatio: 0 },
  ['light-steel', 'split', 'support', 'dorm'],
  {
    'light-steel': { areas: [1000, 3000] },
    'split': { floors: [2, 3.5], areas: [400, 670] },
    'support': { areas: [1800] }
  }
);

// 场景2: 轻钢+分栋+分层
runScenario('场景2-轻钢分栋分层',
  { landArea: 55000, far: 1.5, heightLimit: 30, ancillaryRatio: 0, rdRatio: 0 },
  ['light-steel', 'split', 'layer'],
  {
    'light-steel': { areas: [2000, 4000] },
    'split': { floors: [4], areas: [540, 800] },
    'layer': { floors: [6], areas: [1000] }
  }
);

// 场景4: 分栋+分层+配套（高密度）
runScenario('场景4-分栋分层配套',
  { landArea: 42500, far: 2.0, heightLimit: 40, ancillaryRatio: 0.15, rdRatio: 0 },
  ['split', 'layer', 'support', 'dorm'],
  {
    'split': { floors: [4], areas: [540, 800] },
    'layer': { floors: [8], areas: [800, 1000] },
    'support': { areas: [2400] }
  }
);

// 场景8: 全产品类型
runScenario('场景8-全产品',
  { landArea: 48000, far: 3.0, heightLimit: 60, ancillaryRatio: 0.05, rdRatio: 0.15 },
  ['split', 'layer', 'tower', 'support', 'dorm'],
  {
    'split': { floors: [4], areas: [800, 1000] },
    'layer': { floors: [8, 10], areas: [800, 1200] },
    'tower': { areas: [1800] },
    'support': { areas: [1500] }
  }
);

console.log('\n=== 测试完成 ===');
