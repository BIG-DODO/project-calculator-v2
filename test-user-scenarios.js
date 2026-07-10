// test-user-scenarios.js
// 使用完整版 product-config-algorithm-v2.js 进行测试
// 基于用户提供的测试场景表格

const algorithm = require('./product-config-algorithm-v2.js');
const calculateProductConfig = algorithm.calculateProductConfig;

// 测试场景定义（基于用户表格）
const testScenarios = [
  {
    name: '0-轻钢Only',
    projectData: { landArea: 45000, far: 1.0, heightLimit: 20, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['light-steel']),
    productOptions: { 'light-steel': { areas: [2000, 3000] } }
  },
  {
    name: '1-轻钢+分栋+配套楼',
    projectData: { landArea: 50000, far: 1.2, heightLimit: 30, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: new Set(['light-steel', 'split', 'support']),
    productOptions: {
      'light-steel': { areas: [1000, 3000] },
      'split': { floors: [2, 3.5], areas: [400, 670] },
      'support': { areas: [1800] }
    }
  },
  {
    name: '2-轻钢+分栋+分层',
    projectData: { landArea: 55000, far: 1.5, heightLimit: 30, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['light-steel', 'split', 'layer']),
    productOptions: {
      'light-steel': { areas: [2000, 4000] },
      'split': { floors: [4], areas: [540, 800] },
      'layer': { floors: [6], areas: [1000] }
    }
  },
  {
    name: '3-分栋+分层',
    projectData: { landArea: 62000, far: 1.8, heightLimit: 40, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer']),
    productOptions: {
      'split': { floors: [3.5, 4], areas: [540, 670, 800] },
      'layer': { floors: [6, 8], areas: [600, 1000] }
    }
  },
  {
    name: '4-分栋+分层+配套楼',
    projectData: { landArea: 42500, far: 2.0, heightLimit: 40, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer', 'support']),
    productOptions: {
      'split': { floors: [4], areas: [540, 800] },
      'layer': { floors: [8], areas: [800, 1000] },
      'support': { areas: [2400] }
    }
  },
  {
    name: '5-分栋+分层',
    projectData: { landArea: 66000, far: 2.2, heightLimit: 40, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer']),
    productOptions: {
      'split': { floors: [3.5, 4], areas: [670, 800] },
      'layer': { floors: [6, 8], areas: [800, 1000, 1200] }
    }
  },
  {
    name: '6-分栋+分层',
    projectData: { landArea: 36000, far: 2.5, heightLimit: 50, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer']),
    productOptions: {
      'split': { floors: [3.5, 4], areas: [540, 800] },
      'layer': { floors: [8], areas: [1000, 1200] }
    }
  },
  {
    name: '7-分栋+分层+配套楼+配套宿舍',
    projectData: { landArea: 18900, far: 3.0, heightLimit: 50, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer', 'support', 'dorm']),
    productOptions: {
      'split': { floors: [4], areas: [670, 800] },
      'layer': { floors: [10], areas: [600, 1000] },
      'support': { areas: [1200] }
    }
  },
  {
    name: '8-分栋+分层+产业大厦+配套楼+配套宿舍',
    projectData: { landArea: 48000, far: 3.0, heightLimit: 60, ancillaryRatio: 0.05, rdRatio: 0.15 },
    selectedProducts: new Set(['split', 'layer', 'tower', 'support', 'dorm']),
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [8, 10], areas: [800, 1200] },
      'tower': { areas: [1800] },
      'support': { areas: [1500] }
    }
  },
  {
    name: '9-分层+产业大厦+配套楼+配套宿舍',
    projectData: { landArea: 60000, far: 3.5, heightLimit: 60, ancillaryRatio: 0.10, rdRatio: 0.15 },
    selectedProducts: new Set(['layer', 'tower', 'support', 'dorm']),
    productOptions: {
      'layer': { floors: [6, 8], areas: [600, 800] },
      'tower': { areas: [2400] },
      'support': { areas: [1800] }
    }
  },
  {
    name: '10-分层+产业大厦+配套楼+配套宿舍',
    projectData: { landArea: 35000, far: 4.0, heightLimit: 80, ancillaryRatio: 0.15, rdRatio: 0.15 },
    selectedProducts: new Set(['layer', 'tower', 'support', 'dorm']),
    productOptions: {
      'layer': { floors: [10, 12], areas: [1000, 1200] },
      'tower': { areas: [2000] },
      'support': { areas: [2400] }
    }
  }
];

// 运行测试
console.log('='.repeat(70));
console.log('完整版算法测试 - 基于用户场景表格');
console.log('='.repeat(70));
console.log('');

const results = [];

for (const scenario of testScenarios) {
  // 自动添加配套宿舍：当配套用房面积 > 2400 时
  const landArea = scenario.projectData.landArea;
  const far = scenario.projectData.far;
  const ancillaryRatio = scenario.projectData.ancillaryRatio || 0;
  const targetAncillaryArea = landArea * far * ancillaryRatio;
  
  if (targetAncillaryArea > 2400) {
    scenario.selectedProducts.add('dorm');
    if (!scenario.productOptions['dorm']) {
      scenario.productOptions['dorm'] = { areas: [800, 1000, 1200] };
    }
  }
  
  const density = far < 1.5 ? 0.45 : (far < 2.0 ? 0.42 : 0.40);
  const targetBase = landArea * density;
  const targetCap = landArea * far;
  
  console.log('TEST:', scenario.name);
  console.log('Params: S=%d, F=%.1f, Hl=%d, R2=%.2f, R1=%.2f', 
    landArea, far, scenario.projectData.heightLimit,
    scenario.projectData.ancillaryRatio, scenario.projectData.rdRatio);
  console.log('Products:', Array.from(scenario.selectedProducts).join(', '));
  console.log('');
  
  try {
    const result = calculateProductConfig(scenario.projectData, scenario.selectedProducts, scenario.productOptions);
    if (result.error) throw new Error(result.error);

    // 计算汇总
    const products = result.products;
    const totalBase = result.totalBase;
    const totalCap = result.totalCap;
    const totalCount = result.totalCount;

    const actualDensity = totalBase / landArea;
    const actualFar = totalCap / landArea;
    const densityDiff = Math.abs(actualDensity - density) / density * 100;
    const farDiff = Math.abs(actualFar - far) / far * 100;

    console.log('RESULT:');
    console.log('  Total Base: %d m2 (target %d)', Math.round(totalBase), Math.round(targetBase));
    console.log('  Total Cap: %d m2 (target %d)', Math.round(totalCap), Math.round(targetCap));
    console.log('  Total Count: %d', totalCount);
    console.log('  Density: %.2f%% (target %.2f%%) diff=%.2f%%',
      actualDensity * 100, density * 100, densityDiff);
    console.log('  FAR: %.4f (target %.4f) diff=%.4f%%',
      actualFar, far, farDiff);
    console.log('');

    // 产品明细
    if (products.length > 0) {
      console.log('  Products:');
      products.forEach((p, i) => {
        console.log('    %d. %s %s', i+1, p.type, p.productType || '');
        console.log('       Base: %d, UnitCap: %d, Count: %d, TotalCap: %d',
          p.base, p.unitCap || p.totalCap / p.count, p.count, p.totalCap);
      });
    }

    results.push({
      name: scenario.name,
      success: true,
      densityDiff,
      farDiff,
      totalBase: Math.round(totalBase),
      totalCap: Math.round(totalCap)
    });
    
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    
    results.push({
      name: scenario.name,
      success: false,
      error: err.message
    });
  }
  
  console.log('');
  console.log('-'.repeat(70));
  console.log('');
}

// 汇总
console.log('='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log('');

let passCount = 0;
let failCount = 0;

for (const r of results) {
  if (!r.success) {
    console.log('FAIL: %s - %s', r.name, r.error);
    failCount++;
  } else if (r.densityDiff > 5 || r.farDiff > 0.5) {
    console.log('WARN: %s - Density=%.2f%%, FAR=%.2f%%', r.name, r.densityDiff, r.farDiff);
    failCount++;
  } else {
    console.log('PASS: %s - Density=%.2f%%, FAR=%.2f%%', r.name, r.densityDiff, r.farDiff);
    passCount++;
  }
}

console.log('');
console.log('Total: %d passed, %d failed/warned', passCount, failCount);
console.log('');
console.log('='.repeat(70));
