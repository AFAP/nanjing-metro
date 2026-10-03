'use strict';
/*
 * The service palette, one colour per line id.
 *
 * This is the project's complete 15-line palette (the same values the station
 * page and the 3D page have been using). It lives here so those two pages and
 * the network pages cannot drift apart again: the 2D schematic in
 * network-data.js only draws 14 lines and had its own slightly different
 * values for 5 and 10.
 */
(function (global) {
  global.LINE_COLORS = {
    '1': '#188bc4',
    '2': '#db4651',
    '3': '#4f9d73',
    '4': '#9278b5',
    '5': '#bd9b21',
    '6': '#42b7c6',
    '7': '#599768',
    '10': '#c58d30',
    'S1': '#32a8ad',
    'S2': '#bb5269',
    'S3': '#b67ead',
    'S6': '#c79bb9',
    'S7': '#d892af',
    'S8': '#e98a44',
    'S9': '#dca33b'
  };
  global.LINE_FALLBACK_COLOR = '#66736a';

  // Chip text colour. Several service colours (5号线's dark yellow, S6/S7's
  // dusty pink, 10号线's orange) are far too light for white text, so pick
  // black or white by whichever actually reaches WCAG contrast on that colour.
  function channel(value) {
    var ratio = value / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4);
  }

  function luminance(hex) {
    var value = String(hex).replace('#', '');
    if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    return 0.2126 * channel(parseInt(value.slice(0, 2), 16))
      + 0.7152 * channel(parseInt(value.slice(2, 4), 16))
      + 0.0722 * channel(parseInt(value.slice(4, 6), 16));
  }

  // 0.179 is the crossover where black and white give the same contrast ratio.
  global.LINE_INK = function (color) { return luminance(color) > 0.179 ? '#000000' : '#ffffff'; };
  global.LINE_LUMINANCE = luminance;
})(typeof window !== 'undefined' ? window : globalThis);
