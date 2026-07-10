const algorithm = require('./product-config-algorithm-v2.js');

// 测试场景配置
const scenarios = [
  {
    name: '场景0-纯轻钢',
    projectData: { landArea: 45000, far: 1.0, heightLimit: 20, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: ['light-steel'],
    productOptions: { 'light-steel': { areas: [2000, 3000] } }
  },
  {
    name: '场景1-轻钢分栋配套',
    projectData: { landArea: 50000, far: 1.2, heightLimit: 30, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: ['light-steel', 'split', 'support', 'dorm'],
    productOptions: {
      'light-steel': { areas: [1000, 3000] },
      'split': { floors: [2, 3.5], areas: [400, 670] },
      'support': { areas: [1800] }
    }
  },
  {
    name: '场景2-轻钢分栋分层',
    projectData: { landArea: 55000, far: 1.5, heightLimit: 30, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: ['light-steel', 'split', 'layer'],
    productOptions: {
      'light-steel': { areas: [2000, 4000] },
      'split': { floors: [4], areas: [540, 800] },
      'layer': { floors: [6], areas: [1000] }
    }
  },
  {
    name: '场景3-分栋分层',
    projectData: { landArea: 62000, far: 1.8, heightLimit: 40, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: ['split', 'layer'],
    productOptions: {
      'split': { floors: [3.5, 4], areas: [540, 670, 800] },
      'layer': { floors: [6, 8], areas: [600, 1000] }
    }
  },
  {
    name: '场景4-分栋分层配套',
    projectData: { landArea: 42500, far: 2.0, heightLimit: 40, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: ['split', 'layer', 'support', 'dorm'],
    productOptions: {
      'split': { floors: [4], areas: [540, 800] },
      'layer': { floors: [8], areas: [800, 1000] },
      'support': { areas: [2400] }
    }
  },
  {
    name: '场景5-分栋分层多面积',
    projectData: { landArea: 66000, far: 2.2, heightLimit: 40, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: ['split', 'layer'],
    productOptions: {
      'split': { floors: [3.5, 4], areas: [670, 800] },
      'layer': { floors: [6, 8], areas: [800, 1000, 1200] }
    }
  },
  {
    name: '场景6-分栋分层',
    projectData: { landArea: 36000, far: 2.5, heightLimit: 50, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: ['split', 'layer'],
    productOptions: {
      'split': { floors: [3.5, 4], areas: [540, 800] },
      'layer': { floors: [8], areas: [1000, 1200] }
    }
  },
  {
    name: '场景7-分层限高+配套',
    projectData: { landArea: 18900, far: 3.0, heightLimit: 50, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: ['split', 'layer', 'support', 'dorm'],
    productOptions: {
      'split': { floors: [4], areas: [670, 800] },
      'layer': { floors: [10], areas: [600, 1000] },
      'support': { areas: [1200] }
    }
  },
  {
    name: '场景8-全产品',
    projectData: { landArea: 48000, far: 3.0, heightLimit: 60, ancillaryRatio: 0.05, rdRatio: 0.15 },
    selectedProducts: ['split', 'layer', 'tower', 'support', 'dorm'],
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [8, 10], areas: [800, 1200] },
      'tower': { areas: [1800] },
      'support': { areas: [1500] }
    }
  },
  {
    name: '场景9-分层+产业大厦+配套',
    projectData: { landArea: 60000, far: 3.5, heightLimit: 60, ancillaryRatio: 0.10, rdRatio: 0.15 },
    selectedProducts: ['layer', 'tower', 'support', 'dorm'],
    productOptions: {
      'layer': { floors: [6, 8], areas: [600, 800] },
      'tower': { areas: [2400] },
      'support': { areas: [1800] }
    }
  },
  {
    name: '场景10-分层+产业大厦+配套',
    projectData: { landArea: 35000, far: 4.0, heightLimit: 80, ancillaryRatio: 0.15, rdRatio: 0.15 },
    selectedProducts: ['layer', 'tower', 'support', 'dorm'],
    productOptions: {
      'layer': { floors: [10, 12], areas: [1000, 1200] },
      'tower': { areas: [2000] },
      'support': { areas: [2400] }
    }
  }
];

console.log('=== 产品配置算法测试 ===\n');

for (const scenario of scenarios) {
  console.log(`--- ${scenario.name} ---`);
  console.log(`参数: S=${scenario.projectData.landArea}, F=${scenario.projectData.far}, Hl=${scenario.projectData.heightLimit}, R2=${scenario.projectData.ancillaryRatio}, R1=${scenario.projectData.rdRatio}`);
  
  // 输入验证
  const errors = algorithm.validateInput(scenario.projectData, new Set(scenario.selectedProducts), scenario.productOptions);
  if (errors.length > 0) {
    console.log('验证失败:', errors);
    continue;
  }
  
  // 计算配置
  try {
    const result = algorithm.calculateProductConfig(
      scenario.projectData,
      new Set(scenario.selectedProducts),
      JSON.parse(JSON.stringify(scenario.productOptions))
    );
    
    if (!result || result.length === 0) {
      console.log('无配置输出');
      continue;
    }
    
    // 计算汇总
    let totalBase = 0, totalCap = 0;
    console.log('配置详情:');
    result.forEach((item, i) => {
      const itemBase = (item.actualBase || item.base) * item.count;
      const itemCap = item.unitCap * item.count;
      totalBase += itemBase;
      totalCap += itemCap;
      console.log(`  ${i+1}. ${item.type} ${item.productType || ''}: ${item.count}栋, 基底=${item.base}, 计容=${item.unitCap}`);
    });
    
    const targetBase = scenario.projectData.landArea * algorithm.calcDensity(scenario.projectData.far);
    const targetCap = scenario.projectData.landArea * scenario.projectData.far;
    
    console.log('汇总:');
    console.log(`  目标基底: ${targetBase.toFixed(0)}, 实际基底: ${totalBase.toFixed(0)}, 偏差: ${((totalBase-targetBase)/targetBase*100).toFixed(2)}%`);
    console.log(`  目标计容: ${targetCap.toFixed(0)}, 实际计容: ${totalCap.toFixed(0)}, 偏差: ${((totalCap-targetCap)/targetCap*100).toFixed(2)}%`);
    
  } catch (e) {
    console.log('错误:', e.message);
  }
  
  console.log('');
}

console.log('=== 测试完成 ===');
