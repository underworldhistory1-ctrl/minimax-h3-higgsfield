/* Exact native seed transport and the official 5+17k /24fps video grid. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.H3RenderValues=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';const MAX=18446744073709551615n;
 function randomSeed(){const values=new Uint32Array(2);globalThis.crypto.getRandomValues(values);return (values[0]&0x1fffff)*4294967296+values[1];}
 function seed(value,{allowRandom=false,random=randomSeed}={}){
  if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Seed must be a whole number. Enter large seeds as exact decimal digits.');
  const text=String(value??'').trim();
  if(allowRandom&&(text===''||text==='-1'))return seed(random());
  if(!/^\d{1,20}$/.test(text))throw Error('Seed must be a whole number from 0 to 18446744073709551615; use -1 or leave it empty for Random.');
  const integer=BigInt(text);if(integer>MAX)throw Error('Seed exceeds the native 64-bit maximum.');
  return integer<=BigInt(Number.MAX_SAFE_INTEGER)?Number(integer):String(integer);
 }
 function nextSeed(value){const integer=BigInt(seed(value));return seed(String(integer===MAX?0n:integer+1n));}
 function readJson(response){return response.text().then(parseJson);}
 function parseJson(text){
  let key=null;
  const exact=text.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,(token,index)=>{
   if(token[0]==='"'){key=/^\s*:/.test(text.slice(index+token.length))?JSON.parse(token):null;return token;}
   const isSeed=key==='seed'||key==='noise_seed';key=null;
   if(isSeed&&/^-?\d+$/.test(token)&&(BigInt(token)>BigInt(Number.MAX_SAFE_INTEGER)||BigInt(token)<-BigInt(Number.MAX_SAFE_INTEGER)))return '"'+token+'"';
   return token;
  });return JSON.parse(exact);
 }
 function durationFrames(seconds){if(!Number.isFinite(seconds)||seconds<.2||seconds>15.1)throw Error('Enter a duration from 0.2 to 15.1 seconds.');return 5+17*Math.max(0,Math.min(21,Math.round((seconds*24-5)/17)));}
 return{seed,nextSeed,randomSeed,readJson,parseJson,durationFrames};
});
