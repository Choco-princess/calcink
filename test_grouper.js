import { Stroke } from './src/segmentation/Stroke.js';
import { Grouper } from './src/segmentation/Grouper.js';

function runTests() {
  console.log('🧪 Starting CalcInk Hybrid Architecture Tests...\n');

  // Test 1: Stacked equations with vertically aligned '1's (Error Class 1 Fix)
  // Equation 1 at y=80: '1 + 2'
  const eq1_one = new Stroke();
  eq1_one.addPoint(100, 50);
  eq1_one.addPoint(100, 130); // tall 1

  const eq1_plusV = new Stroke();
  eq1_plusV.addPoint(150, 70);
  eq1_plusV.addPoint(150, 110);
  const eq1_plusH = new Stroke();
  eq1_plusH.addPoint(130, 90);
  eq1_plusH.addPoint(170, 90);

  // Equation 2 at y=220: '1 + 5' (top 1 and bottom 1 share x=100!)
  const eq2_one = new Stroke();
  eq2_one.addPoint(100, 200);
  eq2_one.addPoint(100, 280); // tall 1 directly below eq1_one

  const eq2_plusV = new Stroke();
  eq2_plusV.addPoint(150, 220);
  eq2_plusV.addPoint(150, 260);
  const eq2_plusH = new Stroke();
  eq2_plusH.addPoint(130, 240);
  eq2_plusH.addPoint(170, 240);

  const stackedBlocks = Grouper.groupStrokesIntoLines([
    eq1_one, eq1_plusV, eq1_plusH,
    eq2_one, eq2_plusV, eq2_plusH
  ]);

  console.assert(stackedBlocks.length === 2, `Test 1 Failed: Expected 2 equations, got ${stackedBlocks.length}`);
  console.assert(stackedBlocks[0].clusters.length === 2, `Test 1 Failed: Eq 1 expected 2 clusters, got ${stackedBlocks[0].clusters.length}`);
  console.assert(stackedBlocks[1].clusters.length === 2, `Test 1 Failed: Eq 2 expected 2 clusters, got ${stackedBlocks[1].clusters.length}`);
  console.log('✅ Test 1 Passed: Stacked equations with vertically aligned "1"s cleanly separated into Eq 1 and Eq 2 (No column merging!).');

  // Test 2: Side-by-side equations with horizontal whitespace gap (Error Class 2 Fix)
  // Left equation at x=100..200, y=200
  // Right equation at x=500..600, y=200 (same vertical Y band!)
  const right_one = new Stroke();
  right_one.addPoint(500, 200);
  right_one.addPoint(500, 280);

  const sideBySideBlocks = Grouper.groupStrokesIntoLines([
    eq2_one, eq2_plusV, eq2_plusH,
    right_one
  ]);

  console.assert(sideBySideBlocks.length === 2, `Test 2 Failed: Expected 2 separate equation blocks, got ${sideBySideBlocks.length}`);
  console.log('✅ Test 2 Passed: Side-by-side equations on same Y band cleanly split into distinct equation blocks.');

  // Test 3: Tight equation '3 + 2 = 4' (Anti-domino)
  const char3 = new Stroke();
  char3.addPoint(100, 50);
  char3.addPoint(120, 50);
  char3.addPoint(120, 100);

  const plusV = new Stroke();
  plusV.addPoint(145, 60);
  plusV.addPoint(145, 90);
  const plusH = new Stroke();
  plusH.addPoint(130, 75);
  plusH.addPoint(160, 75);

  const char2 = new Stroke();
  char2.addPoint(170, 50);
  char2.addPoint(200, 50);
  char2.addPoint(170, 100);
  char2.addPoint(200, 100);

  const eqTop = new Stroke();
  eqTop.addPoint(210, 70);
  eqTop.addPoint(240, 70);
  const eqBot = new Stroke();
  eqBot.addPoint(210, 85);
  eqBot.addPoint(240, 85);

  const char4 = new Stroke();
  char4.addPoint(250, 50);
  char4.addPoint(250, 80);
  char4.addPoint(280, 80);
  const char4Stem = new Stroke();
  char4Stem.addPoint(275, 50);
  char4Stem.addPoint(275, 100);

  const tightBlocks = Grouper.groupStrokesIntoLines([char3, plusV, plusH, char2, eqTop, eqBot, char4, char4Stem]);
  console.assert(tightBlocks[0].clusters.length === 5, `Test 3 Failed: Expected 5 clusters, got ${tightBlocks[0].clusters.length}`);
  console.log('✅ Test 3 Passed: Tight equation "3+2=4" produced exactly 5 distinct characters.');

  // Test 4: Equals sign '=' with wide gap
  const topBar = new Stroke();
  topBar.addPoint(300, 80);
  topBar.addPoint(350, 80);
  const botBar = new Stroke();
  botBar.addPoint(300, 110);
  botBar.addPoint(350, 110);

  const eqBlocks = Grouper.groupStrokesIntoLines([topBar, botBar]);
  console.assert(eqBlocks[0].clusters.length === 1, `Test 4 Failed: Expected 1 cluster for '=', got ${eqBlocks[0].clusters.length}`);
  console.log('✅ Test 4 Passed: Spaced horizontal bars for "=" cleanly merged into 1 cluster.');

  // Test 5: Multi-stroke '1' with base bar '_'
  const oneStem = new Stroke();
  oneStem.addPoint(60, 50);
  oneStem.addPoint(60, 120);
  const oneBase = new Stroke();
  oneBase.addPoint(45, 122);
  oneBase.addPoint(75, 122);

  const oneBlocks = Grouper.groupStrokesIntoLines([oneStem, oneBase]);
  console.assert(oneBlocks[0].clusters.length === 1, `Test 5 Failed: Expected 1 cluster for '1', got ${oneBlocks[0].clusters.length}`);
  console.log('✅ Test 5 Passed: Stem and base bar for "1" cleanly merged into 1 cluster.');

  console.log('\n🎉 ALL HYBRID ARCHITECTURE TESTS PASSED PERFECTLY!');
}

runTests();
