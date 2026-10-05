(function(root){
  'use strict';
  function normalize(value){return typeof value==='string'?value.trim().toLowerCase():'';}
  function valid(value){return /^[a-z][a-z0-9_-]{2,31}$/.test(normalize(value));}
  function accountIdentifier(value){
    if(!valid(value))throw new Error('INVALID_USERNAME');
    return normalize(value)+'@users.wj.invalid';
  }
  const api={normalize,valid,accountIdentifier};root.StoreUsername=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
