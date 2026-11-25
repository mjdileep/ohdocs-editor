import test from 'node:test'
import assert from 'node:assert/strict'
import {createPressHold} from './press-hold.js'

function fixture(){
  let job,opened=0,point;
  const hold=createPressHold(p=>{opened++;point=p},{schedule:fn=>(job=fn,1),unschedule:()=>{job=undefined}});
  return {hold,fire:()=>job?.(),get opened(){return opened},get point(){return point}};
}
const point={id:1,x:50,y:80,primary:true,target:'note-a'};
test('a stationary hold opens once and its release suppresses the normal tap',()=>{
  const f=fixture();f.hold.start(point);assert.equal(f.opened,0);f.fire();assert.equal(f.opened,1);assert.equal(f.point.target,'note-a');assert.equal(f.hold.end(1),true);assert.equal(f.hold.end(1),false);
});
test('ordinary taps and scrolling do not open a menu',()=>{
  const f=fixture();f.hold.start(point);assert.equal(f.hold.end(1),false);f.fire();assert.equal(f.opened,0);
  f.hold.start(point);f.hold.move(1,50,95);f.fire();assert.equal(f.opened,0);
  f.hold.start(point);f.hold.cancel();f.fire();assert.equal(f.opened,0);
});
test('small touch jitter is tolerated, while multitouch cancels the gesture',()=>{
  const f=fixture();f.hold.start(point);f.hold.move(1,53,84);f.fire();assert.equal(f.opened,1);f.hold.end(1);
  f.hold.start(point);f.hold.start({...point,id:2,primary:false});f.fire();assert.equal(f.opened,1);
});
