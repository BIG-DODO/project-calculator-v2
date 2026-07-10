// test-algorithm.js
// 算法版本测试脚本

// 模拟 projectData 和 selectedProducts
function createTestScenario(name, params) {
  return {
    name,
    projectData: {
      landArea: params.landArea || 30000,
      far: params.far || 1.8,
      heightLimit: params.heightLimit || 50,
      ancillaryRatio: params.ancillaryRatio || 0.1,
      rdRatio: params.rdRatio || 0,
      region: params.region || '上海',
      landUseType: params.landUseType || 'M'
    },
    selectedProducts: new Set(params.selectedProducts || ['split', 'layer']),
    productOptions: params.productOptions || {
      'split': { floors: [3, 4], areas: [800, 1000] },
      'layer': { floors: [6, 8], areas: [800, 1000] }
    }
  };
}

// 测试场景
const testScenarios = [
  // 场景1：仅分栋厂房（单一层数）
  createTestScenario('仅分栋-单层数', {
    landArea: 20000,
    far: 1.2,
    selectedProducts: ['split'],
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] }
    }
  }),
  
  // 场景2：仅分栋厂房（两种层数）
  createTestScenario('仅分栋-双层数', {
    landArea: 30000,
    far: 1.5,
    selectedProducts: ['split'],
    productOptions: {
      'split': { floors: [3, 4], areas: [800, 1000] }
    }
  }),
  
  // 场景3：分栋+轻钢
  createTestScenario('分栋+轻钢', {
    landArea: 25000,
    far: 1.3,
    selectedProducts: ['split', 'light-steel'],
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'light-steel': { areas: [2000, 3000] }
    }
  }),
  
  // 场景4：分栋+分层
  createTestScenario('分栋+分层', {
    landArea: 40000,
    far: 2.0,
    selectedProducts: ['split', 'layer'],
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [6, 8], areas: [800, 1000] }
    }
  }),
  
  // 场景5：三种厂房类型
  createTestScenario('三种厂房', {
    landArea: 50000,
    far: 2.2,
    selectedProducts: ['split', 'layer', 'light-steel'],
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [6, 8], areas: [800, 1000] },
      'light-steel': { areas: [2000, 3000] }
    }
  }),
  
  // 场景6：含产业大厦
  createTestScenario('含产业大厦', {
    landArea: 50000,
    far: 2.5,
    rdRatio: 0.15,
    selectedProducts: ['tower', 'split', 'layer'],
    productOptions: {
      'tower': { areas: [2000] },
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [6, 8], areas: [800, 1000] }
    }
  }),
  
  // 场景7：含配套宿舍+配套楼
  createTestScenario('含配套', {
    landArea: 30000,
    far: 1.8,
    ancillaryRatio: 0.12,
    selectedProducts: ['split', 'dorm', 'support'],
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'support': { areas: [1800] }
    }
  }),
  
  // 场景8：上海C65含产业大厦
  createTestScenario('上海C65', {
    landArea: 40000,
    far: 2.5,
    rdRatio: 0.1,
    ancillaryRatio: 0.1,
    region: '上海',
    landUseType: 'C65',
    selectedProducts: ['tower', 'split', 'layer', 'dorm', 'support'],
    productOptions: {
      'tower': { areas: [2000] },
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [6, 8], areas: [800, 1000] },
      'support': { areas: [1800] }
    }
  }),
  
  // 场景9：低容积率（仅轻钢+分栋）
  createTestScenario('低容积率', {
    landArea: 20000,
    far: 1.0,
    selectedProducts: ['light-steel', 'split'],
    productOptions: {
      'light-steel': { areas: [2000, 3000] },
      'split': { floors: [2, 3], areas: [800, 1000] }
    }
  }),
  
  // 场景10：高容积率（分层+产业大厦）
  createTestScenario('高容积率', {
    landArea: 30000,
    far: 3.0,
    rdRatio: 0.15,
    selectedProducts: ['layer', 'tower'],
    productOptions: {
      'layer': { floors: [8, 10], areas: [1000, 1200] },
      'tower': { areas: [2400] }
    }
  })
];

// 运行测试
function runTests() {
  console.log('========================================');
  console.log('产品配置算法版本测试');
  console.log('========================================\n');
  
  testScenarios.forEach((scenario, index) => {
    console.log(`\n--- 场景 ${index + 1}: ${scenario.name} ---`);
    console.log(`用地面积: ${scenario.projectData.landArea}m²`);
    console.log(`容积率: ${scenario.projectData.far}`);
    console.log(`限高: ${scenario.projectData.heightLimit}m`);
    console.log(`配套占比: ${scenario.projectData.ancillaryRatio}`);
    console.log(`研发占比: ${scenario.projectData.rdRatio}`);
    console.log(`已选产品: ${Array.from(scenario.selectedProducts).join(', ')}`);
    
    // 计算目标值
    const landArea = scenario.projectData.landArea;
    const far = scenario.projectData.far;
    const density = far < 1.5 ? 0.45 : (far < 2.0 ? 0.42 : 0.40);
    const targetBase = landArea * density;
    const targetCap = landArea * far;
    
    console.log(`目标密度: ${(density * 100).toFixed(1)}%`);
    console.log(`目标基底: ${targetBase.toFixed(0)}m²`);
    console.log(`目标计容: ${targetCap.toFixed(0)}m²`);
    
    // 这里可以调用 v1 和 v2 的算法进行比较
    // 由于算法在浏览器环境中运行，这里只输出参数
  });
  
  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

// 如果在Node环境中运行
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testScenarios, runTests };
}

// 如果在浏览器中运行
if (typeof window !== 'undefined') {
  window.runAlgorithmTests = runTests;
}
