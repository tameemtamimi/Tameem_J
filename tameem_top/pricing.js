/* Mode/range rules shared by the UI and tests; the database independently enforces them. */
(function(root){
  'use strict';
  const C = root.GoldCalculator || require('./calculator.js');
  const settingKeys = ['sell_min','sell_max','buy_price','sell_usd','sell_ils','buy_usd','buy_ils'];
  function compare(a,b) {
    const x=C.parse(a), y=C.parse(b);
    if(x.state!=='valid'||y.state!=='valid') throw new Error('Invalid decimal');
    const left=x.integer*10n**BigInt(y.scale),right=y.integer*10n**BigInt(x.scale);
    return left<right?-1:left>right?1:0;
  }
  function validateSettings(settings) {
    if(!settings||settingKeys.some(k=>C.parse(settings[k]??'',true).state!=='valid')) return false;
    return compare(settings.sell_min,settings.sell_max)<=0;
  }
  function modeValues(mode,settings,selectedPrice) {
    if(!validateSettings(settings)||!['sell','buy'].includes(mode)) return null;
    return {price:mode==='buy'?settings.buy_price:selectedPrice,usd:settings[mode+'_usd'],ils:settings[mode+'_ils']};
  }
  function priceAllowed(mode,settings,price) {
    if(!validateSettings(settings)||C.parse(price,true).state!=='valid') return false;
    return mode==='buy'?compare(price,settings.buy_price)===0:mode==='sell'&&compare(price,settings.sell_min)>=0&&compare(price,settings.sell_max)<=0;
  }
  function stepPrice(price,direction,settings) {
    const parsed=C.parse(price);
    if(parsed.state!=='valid') return settings.sell_min;
    const scale=10n**BigInt(parsed.scale);
    const value={integer:parsed.integer+BigInt(direction)*scale,scale:parsed.scale};
    if(value.integer<0n) return settings.sell_min;
    const maximum=C.parse(settings.sell_max);
    if(value.integer*10n**BigInt(maximum.scale)>maximum.integer*scale)return settings.sell_max;
    const text=C.format(value,parsed.scale).replaceAll(',','');
    if(compare(text,settings.sell_min)<0)return settings.sell_min;
    if(compare(text,settings.sell_max)>0)return settings.sell_max;
    return text;
  }
  const api={settingKeys,compare,validateSettings,modeValues,priceAllowed,stepPrice};
  root.StorePricing=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
