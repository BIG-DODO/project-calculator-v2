// test-full-algorithm.js
// 使用完整版 product-config-algorithm-v2.js 进行测试

// 模拟浏览器环境
global.sessionStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; }
};

global.window = {
  sessionStorage: global.sessionStorage,
  configResult: null
};

global.document = {
  getElementById(id) {
    return {
      textContent: '',
      style: { display: 'none' },
      innerHTML: '',
      value: ''
    };
  }
};

// 加载完整算法
const algorithm = require('./product-config-algorithm-v2.js');
const calculateProductConfig = algorithm.calculateProductConfig;

// 测试场景定义
const testScenarios = [
  {
    name: '1-SingleSplit-SingleFloor',
    projectData: { landArea: 20000, far: 1.2, heightLimit: 50, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split']),
    productOptions: { 'split': { floors: [4], areas: [800, 1000] } }
  },
  {
    name: '2-SingleSplit-TwoFloors',
    projectData: { landArea: 30000, far: 1.5, heightLimit: 50, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split']),
    productOptions: { 'split': { floors: [3, 4], areas: [800, 1000] } }
  },
  {
    name: '3-Split+LightSteel',
    projectData: { landArea: 25000, far: 1.3, heightLimit: 50, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split', 'light-steel']),
    productOptions: { 
      'split': { floors: [4], areas: [800, 1000] },
      'light-steel': { areas: [2000, 3000] }
    }
  },
  {
    name: '4-Split+Layer',
    projectData: { landArea: 40000, far: 2.0, heightLimit: 50, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer']),
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [6, 8], areas: [800, 1000] }
    }
  },
  {
    name: '5-ThreeTypes',
    projectData: { landArea: 50000, far: 2.2, heightLimit: 60, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer', 'light-steel']),
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [6, 8], areas: [800, 1000] },
      'light-steel': { areas: [2000, 3000] }
    }
  },
  {
    name: '6-WithTower',
    projectData: { landArea: 50000, far: 2.5, heightLimit: 80, ancillaryRatio: 0, rdRatio: 0.15 },
    selectedProducts: new Set(['tower', 'split', 'layer']),
    productOptions: {
      'tower': { areas: [2000] },
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [6, 8], areas: [800, 1000] }
    }
  },
  {
    name: '7-WithDorm+Support',
    projectData: { landArea: 30000, far: 1.8, heightLimit: 50, ancillaryRatio: 0.12, rdRatio: 0 },
    selectedProducts: new Set(['split', 'dorm', 'support']),
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'support': { areas: [1800] }
    }
  },
  {
    name: '8-ShanghaiC65',
    projectData: { landArea: 40000, far: 2.5, heightLimit: 80, ancillaryRatio: 0.10, rdRatio: 0.10 },
    selectedProducts: new Set(['tower', 'split', 'layer', 'dorm', 'support']),
    productOptions: {
      'tower': { areas: [2000] },
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [6, 8], areas: [800, 1000] },
      'support': { areas: [1800] }
    }
  },
  {
    name: '9-LowFAR',
    projectData: { landArea: 20000, far: 1.0, heightLimit: 50, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['light-steel', 'split']),
    productOptions: {
      'light-steel': { areas: [2000, 3000] },
      'split': { floors: [2, 3], areas: [800, 1000] }
    }
  },
  {
    name: '10-HighFAR',
    projectData: { landArea: 30000, far: 3.0, heightLimit: 100, ancillaryRatio: 0, rdRatio: 0.15 },
    selectedProducts: new Set(['layer', 'tower']),
    productOptions: {
      'layer': { floors: [8, 10], areas: [1000, 1200] },
      'tower': { areas: [2400] }
    }
  }
];

// 运行测试
console.log('='.repeat(70));
console.log('完整版算法测试 - product-config-algorithm-v2.js');
console.log('='.repeat(70));
console.log('');

const results = [];

for (const scenario of testScenarios) {
  // 设置全局变量
  global.projectData = scenario.projectData;
  global.selectedProducts = scenario.selectedProducts;
  global.productOptions = scenario.productOptions;
  
  const landArea = scenario.projectData.landArea;
  const far = scenario.projectData.far;
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
    const result = calculateProductConfig();
    
    const actualDensity = result.totalBase / landArea;
    const actualFar = result.totalCap / landArea;
    const densityDiff = Math.abs(actualDensity - density) / density * 100;
    const farDiff = Math.abs(actualFar - far) / far * 100;
    
    console.log('RESULT:');
    console.log('  Total Base: %d m²', result.totalBase);
    console.log('  Total Cap: %d m²', result.totalCap);
    console.log('  Total Count: %d', result.totalCount);
    console.log('  Density: %.2f%% (target %.2f%%) diff=%.2f%%',
      actualDensity * 100, density * 100, densityDiff);
    console.log('  FAR: %.4f (target %.4f) diff=%.4f%%',
      actualFar, far, farDiff);
    console.log('');
    
    // 产品明细
    if (result.products && result.products.length > 0) {
      console.log('  Products:');
      result.products.forEach((p, i) => {
        console.log('    %d. %s %s', i+1, p.type, p.productType || '');
        console.log('       Base: %d, UnitCap: %d, Count: %d, TotalCap: %d',
          p.base, p.unitCap, p.count, p.totalCap);
      });
    }
    
    results.push({
      name: scenario.name,
      success: true,
      densityDiff,
      farDiff,
      totalBase: result.totalBase,
      totalCap: result.totalCap
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
  } else if (r.densityDiff > 5 || r.farDiff > 0.01) {
    console.log('WARN: %s - Density=%.2f%%, FAR=%.4f%%', r.name, r.densityDiff, r.farDiff);
    failCount++;
  } else {
    console.log('PASS: %s - Density=%.2f%%, FAR=%.4f%%', r.name, r.densityDiff, r.farDiff);
    passCount++;
  }
}

console.log('');
console.log('Total: %d passed, %d failed/warned', passCount, failCount);
console.log('');
console.log('='.repeat(70));
