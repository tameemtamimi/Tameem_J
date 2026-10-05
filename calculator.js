/* Decimal arithmetic uses integers to avoid floating-point currency errors. */
(function (root) {
  'use strict';
  function normalize(value) {
    return String(value).trim().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)).replace(/٫/g, '.');
  }
  function parse(value, rate = false) {
    const text = normalize(value);
    if (!text || text === '.') return { state: 'empty' };
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return { state: 'invalid', message: 'أدخل رقماً موجباً، واستخدم النقطة للفاصل العشري.' };
    const [whole = '', fraction = ''] = text.split('.');
    if (whole.length > 9 || fraction.length > 6) return { state: 'invalid', message: 'الحد الأقصى 9 أرقام صحيحة و6 منازل عشرية.' };
    const integer = BigInt((whole || '0') + fraction);
    if (rate && integer === 0n) return { state: 'invalid', message: 'يجب أن يكون سعر الصرف أكبر من صفر.' };
    return { state: 'valid', integer, scale: fraction.length, text };
  }
  function multiply(a, b) { return { integer: a.integer * b.integer, scale: a.scale + b.scale }; }
  function format(value, digits) {
    let integer = value.integer;
    if (value.scale > digits) {
      const divisor = 10n ** BigInt(value.scale - digits);
      integer = (integer + divisor / 2n) / divisor;
    } else integer *= 10n ** BigInt(digits - value.scale);
    const text = integer.toString().padStart(digits + 1, '0');
    const whole = digits ? text.slice(0, -digits) : text;
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (digits ? '.' + text.slice(-digits) : '');
  }
  function calculate(values) {
    const fields = Object.fromEntries(['weight', 'price', 'usd', 'ils'].map(key => [key, parse(values[key] ?? '', key === 'usd' || key === 'ils')]));
    const results = { jod: null, usd: null, ils: null };
    if (fields.weight.state === 'valid' && fields.price.state === 'valid') {
      const total = multiply(fields.weight, fields.price);
      results.jod = format(total, 3);
      for (const key of ['usd', 'ils']) if (fields[key].state === 'valid') results[key] = format(multiply(total, fields[key]), 2);
    }
    return { fields, results };
  }
  const api = { normalize, parse, multiply, format, calculate };
  root.GoldCalculator = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
