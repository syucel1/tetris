import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard,fits,rotate,clearLines,bag,SHAPES} from './engine.ts';
test('collision checks walls, floor and existing blocks',()=>{const b=emptyBoard();assert.equal(fits(b,SHAPES[0],7,0),false);assert.equal(fits(b,SHAPES[0],0,20),false);b[19][0]=1;assert.equal(fits(b,SHAPES[0],0,19),false);assert.equal(fits(b,SHAPES[0],0,18),true);});
test('clears four lines and restores board dimensions',()=>{const b=emptyBoard();for(let y=16;y<20;y++)b[y].fill(1);b[15][4]=3;const r=clearLines(b);assert.equal(r.lines,4);assert.equal(r.board.length,20);assert.equal(r.board[19][4],3);assert.deepEqual(r.board[0],Array(10).fill(0));});
test('four rotations restore original shape',()=>{for(const s of SHAPES)assert.deepEqual(rotate(rotate(rotate(rotate(s)))),s);});
test('each bag has exactly one of every piece',()=>{for(let i=0;i<20;i++)assert.deepEqual(bag().sort(),[0,1,2,3,4,5,6]);});
