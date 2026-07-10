// test-node.js
// Node.js 测试脚本，直接调用 product-config-algorithm-v2.js 中的算法

// 模拟浏览器环境
const projectData = {
  landArea: 30000,
  far: 1.8,
  heightLimit: 50,
  ancillaryRatio: 0.1,
  rdRatio: 0,
  region: '上海',
  landUseType: 'M'
};

const selectedProducts = new Set(['split', 'layer']);

const productOptions = {
  'split': { floors: [3, 4], areas: [800, 1000] },
  'layer': { floors: [6, 8], areas: [800, 1000] }
};

// 模拟 sessionStorage
const sessionStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; }
};

// 模拟 window
const window = {
  sessionStorage,
  configResult: null
};

// 模拟 document
const document = {
  getElementById(id) {
    return {
      textContent: '',
      style: { display: 'none' },
      innerHTML: '',
      value: ''
    };
  }
};

// 设置全局变量
global.projectData = projectData;
global.selectedProducts = selectedProducts;
global.productOptions = productOptions;
global.sessionStorage = sessionStorage;
global.window = window;
global.document = document;

// 加载算法文件
require('./product-config-algorithm-v2.js');

// 运行测试
console.log('========================================');
console.log('Node.js 算法测试');
console.log('========================================');
console.log('用地面积:', projectData.landArea);
console.log('容积率:', projectData.far);
console.log('限高:', projectData.heightLimit);
console.log('配套占比:', projectData.ancillaryRatio);
console.log('研发占比:', projectData.rdRatio);
console.log('已选产品:', Array.from(selectedProducts).join(', '));
console.log('');

try {
  const result = calculateProductConfig();
  
  console.log('--- 计算结果 ---');
  console.log('总基底:', result.totalBase.toFixed(2));
  console.log('总建筑面积:', result.totalArea.toFixed(2));
  console.log('总计容:', result.totalCap.toFixed(2));
  console.log('总栋数:', result.totalCount);
  console.log('');
  
  console.log('--- 偏差检查 ---');
  console.log('目标密度:', result._check.targetDensity.toFixed(4));
  console.log('实际密度:', result._check.actualDensity.toFixed(4));
  console.log('密度偏差:', (Math.abs(result._check.actualDensity - result._check.targetDensity) / result._check.targetDensity * 100).toFixed(2) + '%');
  console.log('');
  console.log('目标容积率:', result._check.targetFar.toFixed(4));
  console.log('实际容积率:', result._check.actualFar.toFixed(4));
  console.log('容积率偏差:', (Math.abs(result._check.actualFar - result._check.targetFar) / result._check.targetFar * 100).toFixed(2) + '%');
  console.log('');
  
  console.log('--- 产品明细 ---');
  result.products.forEach((p, i) => {
    console.log(`${i+1}. ${p.type} ${p.productType}`);
    console.log(`   形式: ${p.form} | 层数: ${p.floors} | 高度: ${p.totalHeight}m`);
    console.log(`   基底: ${p.base}m² | 单栋面积: ${p.unitArea}m² | 单栋计容: ${p.unitCap}m²`);
    console.log(`   栋数: ${p.count} | 总基底: ${p.totalBase}m² | 总计容: ${p.totalCap}m²`);
    console.log('');
  });
  
} catch (err) {
  console.error('计算错误:', err.message);
  console.error(err.stack);
}

console.log('========================================');
console.log('测试完成');
console.log('========================================');
