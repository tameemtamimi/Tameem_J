const assert=require('node:assert/strict'),U=require('../username.js');
assert.equal(U.accountIdentifier(' TaMim '),'tamim@users.wj.invalid');
for(const name of ['tamim','user_2','user-3'])assert(U.valid(name));
for(const name of ['ab','2tamim','tamim@example.com','تميم','<script>','a'.repeat(33),'user name',''])assert(!U.valid(name));
assert.throws(()=>U.accountIdentifier('bad@example.com'));
console.log('Username normalization, validation and deterministic account mapping passed.');
