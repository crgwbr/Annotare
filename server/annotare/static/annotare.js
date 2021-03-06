var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = x + '/package.json';
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    var dirname = require._core[filename]
        ? ''
        : require.modules.path().dirname(filename)
    ;
    
    var require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    var module_ = { exports : {} };
    
    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

if (!process.env) process.env = {};
if (!process.argv) process.argv = [];

require.define("path", function (require, module, exports, __dirname, __filename) {
function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("/node_modules/flakey/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"./flakey.js"}
});

require.define("/node_modules/flakey/flakey.js", function (require, module, exports, __dirname, __filename) {
(function() {
  /**
 * Diff Match and Patch
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Computes the difference between two texts to create a patch.
 * Applies the patch onto another text, allowing for errors.
 * @author fraser@google.com (Neil Fraser)
 */

/**
 * Class containing the diff, match and patch methods.
 * @constructor
 */
function diff_match_patch() {

  // Defaults.
  // Redefine these in your program to override the defaults.

  // Number of seconds to map a diff before giving up (0 for infinity).
  this.Diff_Timeout = 1.0;
  // Cost of an empty edit operation in terms of edit characters.
  this.Diff_EditCost = 4;
  // At what point is no match declared (0.0 = perfection, 1.0 = very loose).
  this.Match_Threshold = 0.5;
  // How far to search for a match (0 = exact location, 1000+ = broad match).
  // A match this many characters away from the expected location will add
  // 1.0 to the score (0.0 is a perfect match).
  this.Match_Distance = 1000;
  // When deleting a large block of text (over ~64 characters), how close does
  // the contents have to match the expected contents. (0.0 = perfection,
  // 1.0 = very loose).  Note that Match_Threshold controls how closely the
  // end points of a delete need to match.
  this.Patch_DeleteThreshold = 0.5;
  // Chunk size for context length.
  this.Patch_Margin = 4;

  // The number of bits in an int.
  this.Match_MaxBits = 32;
}


//  DIFF FUNCTIONS


/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;

/** @typedef {!Array.<number|string>} */
diff_match_patch.Diff;


/**
 * Find the differences between two texts.  Simplifies the problem by stripping
 * any common prefix or suffix off the texts before diffing.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {boolean=} opt_checklines Optional speedup flag. If present and false,
 *     then don't run a line-level diff first to identify the changed areas.
 *     Defaults to true, which does a faster, slightly less optimal diff.
 * @param {number} opt_deadline Optional time when the diff should be complete
 *     by.  Used internally for recursive calls.  Users should set DiffTimeout
 *     instead.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 */
diff_match_patch.prototype.diff_main = function(text1, text2, opt_checklines,
    opt_deadline) {
  // Set a deadline by which time the diff must be complete.
  if (typeof opt_deadline == 'undefined') {
    if (this.Diff_Timeout <= 0) {
      opt_deadline = Number.MAX_VALUE;
    } else {
      opt_deadline = (new Date).getTime() + this.Diff_Timeout * 1000;
    }
  }
  var deadline = opt_deadline;

  // Check for null inputs.
  if (text1 == null || text2 == null) {
    throw new Error('Null input. (diff_main)');
  }

  // Check for equality (speedup).
  if (text1 == text2) {
    if (text1) {
      return [[DIFF_EQUAL, text1]];
    }
    return [];
  }

  if (typeof opt_checklines == 'undefined') {
    opt_checklines = true;
  }
  var checklines = opt_checklines;

  // Trim off common prefix (speedup).
  var commonlength = this.diff_commonPrefix(text1, text2);
  var commonprefix = text1.substring(0, commonlength);
  text1 = text1.substring(commonlength);
  text2 = text2.substring(commonlength);

  // Trim off common suffix (speedup).
  commonlength = this.diff_commonSuffix(text1, text2);
  var commonsuffix = text1.substring(text1.length - commonlength);
  text1 = text1.substring(0, text1.length - commonlength);
  text2 = text2.substring(0, text2.length - commonlength);

  // Compute the diff on the middle block.
  var diffs = this.diff_compute_(text1, text2, checklines, deadline);

  // Restore the prefix and suffix.
  if (commonprefix) {
    diffs.unshift([DIFF_EQUAL, commonprefix]);
  }
  if (commonsuffix) {
    diffs.push([DIFF_EQUAL, commonsuffix]);
  }
  this.diff_cleanupMerge(diffs);
  return diffs;
};


/**
 * Find the differences between two texts.  Assumes that the texts do not
 * have any common prefix or suffix.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {boolean} checklines Speedup flag.  If false, then don't run a
 *     line-level diff first to identify the changed areas.
 *     If true, then run a faster, slightly less optimal diff.
 * @param {number} deadline Time when the diff should be complete by.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_compute_ = function(text1, text2, checklines,
    deadline) {
  var diffs;

  if (!text1) {
    // Just add some text (speedup).
    return [[DIFF_INSERT, text2]];
  }

  if (!text2) {
    // Just delete some text (speedup).
    return [[DIFF_DELETE, text1]];
  }

  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  var i = longtext.indexOf(shorttext);
  if (i != -1) {
    // Shorter text is inside the longer text (speedup).
    diffs = [[DIFF_INSERT, longtext.substring(0, i)],
             [DIFF_EQUAL, shorttext],
             [DIFF_INSERT, longtext.substring(i + shorttext.length)]];
    // Swap insertions for deletions if diff is reversed.
    if (text1.length > text2.length) {
      diffs[0][0] = diffs[2][0] = DIFF_DELETE;
    }
    return diffs;
  }

  if (shorttext.length == 1) {
    // Single character string.
    // After the previous speedup, the character can't be an equality.
    return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
  }
  longtext = shorttext = null;  // Garbage collect.

  // Check to see if the problem can be split in two.
  var hm = this.diff_halfMatch_(text1, text2);
  if (hm) {
    // A half-match was found, sort out the return data.
    var text1_a = hm[0];
    var text1_b = hm[1];
    var text2_a = hm[2];
    var text2_b = hm[3];
    var mid_common = hm[4];
    // Send both pairs off for separate processing.
    var diffs_a = this.diff_main(text1_a, text2_a, checklines, deadline);
    var diffs_b = this.diff_main(text1_b, text2_b, checklines, deadline);
    // Merge the results.
    return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);
  }

  if (checklines && text1.length > 100 && text2.length > 100) {
    return this.diff_lineMode_(text1, text2, deadline);
  }

  return this.diff_bisect_(text1, text2, deadline);
};


/**
 * Do a quick line-level diff on both strings, then rediff the parts for
 * greater accuracy.
 * This speedup can produce non-minimal diffs.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {number} deadline Time when the diff should be complete by.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_lineMode_ = function(text1, text2, deadline) {
  // Scan the text on a line-by-line basis first.
  var a = this.diff_linesToChars_(text1, text2);
  text1 = /** @type {string} */(a[0]);
  text2 = /** @type {string} */(a[1]);
  var linearray = /** @type {!Array.<string>} */(a[2]);

  var diffs = this.diff_bisect_(text1, text2, deadline);

  // Convert the diff back to original text.
  this.diff_charsToLines_(diffs, linearray);
  // Eliminate freak matches (e.g. blank lines)
  this.diff_cleanupSemantic(diffs);

  // Rediff any replacement blocks, this time character-by-character.
  // Add a dummy entry at the end.
  diffs.push([DIFF_EQUAL, '']);
  var pointer = 0;
  var count_delete = 0;
  var count_insert = 0;
  var text_delete = '';
  var text_insert = '';
  while (pointer < diffs.length) {
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert += diffs[pointer][1];
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        break;
      case DIFF_EQUAL:
        // Upon reaching an equality, check for prior redundancies.
        if (count_delete >= 1 && count_insert >= 1) {
          // Delete the offending records and add the merged ones.
          var a = this.diff_main(text_delete, text_insert, false, deadline);
          diffs.splice(pointer - count_delete - count_insert,
                       count_delete + count_insert);
          pointer = pointer - count_delete - count_insert;
          for (var j = a.length - 1; j >= 0; j--) {
            diffs.splice(pointer, 0, a[j]);
          }
          pointer = pointer + a.length;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = '';
        text_insert = '';
        break;
    }
    pointer++;
  }
  diffs.pop();  // Remove the dummy entry at the end.

  return diffs;
};


/**
 * Find the 'middle snake' of a diff, split the problem in two
 * and return the recursively constructed diff.
 * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {number} deadline Time at which to bail if not yet complete.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_bisect_ = function(text1, text2, deadline) {
  // Cache the text lengths to prevent multiple calls.
  var text1_length = text1.length;
  var text2_length = text2.length;
  var max_d = Math.ceil((text1_length + text2_length) / 2);
  var v_offset = max_d;
  var v_length = 2 * max_d;
  var v1 = new Array(v_length);
  var v2 = new Array(v_length);
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing
  // integers and undefined.
  for (var x = 0; x < v_length; x++) {
    v1[x] = -1;
    v2[x] = -1;
  }
  v1[v_offset + 1] = 0;
  v2[v_offset + 1] = 0;
  var delta = text1_length - text2_length;
  // If the total number of characters is odd, then the front path will collide
  // with the reverse path.
  var front = (delta % 2 != 0);
  // Offsets for start and end of k loop.
  // Prevents mapping of space beyond the grid.
  var k1start = 0;
  var k1end = 0;
  var k2start = 0;
  var k2end = 0;
  for (var d = 0; d < max_d; d++) {
    // Bail out if deadline is reached.
    if ((new Date()).getTime() > deadline) {
      break;
    }

    // Walk the front path one step.
    for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      var k1_offset = v_offset + k1;
      var x1;
      if (k1 == -d || k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1]) {
        x1 = v1[k1_offset + 1];
      } else {
        x1 = v1[k1_offset - 1] + 1;
      }
      var y1 = x1 - k1;
      while (x1 < text1_length && y1 < text2_length &&
             text1.charAt(x1) == text2.charAt(y1)) {
        x1++;
        y1++;
      }
      v1[k1_offset] = x1;
      if (x1 > text1_length) {
        // Ran off the right of the graph.
        k1end += 2;
      } else if (y1 > text2_length) {
        // Ran off the bottom of the graph.
        k1start += 2;
      } else if (front) {
        var k2_offset = v_offset + delta - k1;
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {
          // Mirror x2 onto top-left coordinate system.
          var x2 = text1_length - v2[k2_offset];
          if (x1 >= x2) {
            // Overlap detected.
            return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
          }
        }
      }
    }

    // Walk the reverse path one step.
    for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      var k2_offset = v_offset + k2;
      var x2;
      if (k2 == -d || k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1]) {
        x2 = v2[k2_offset + 1];
      } else {
        x2 = v2[k2_offset - 1] + 1;
      }
      var y2 = x2 - k2;
      while (x2 < text1_length && y2 < text2_length &&
             text1.charAt(text1_length - x2 - 1) ==
             text2.charAt(text2_length - y2 - 1)) {
        x2++;
        y2++;
      }
      v2[k2_offset] = x2;
      if (x2 > text1_length) {
        // Ran off the left of the graph.
        k2end += 2;
      } else if (y2 > text2_length) {
        // Ran off the top of the graph.
        k2start += 2;
      } else if (!front) {
        var k1_offset = v_offset + delta - k2;
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
          var x1 = v1[k1_offset];
          var y1 = v_offset + x1 - k1_offset;
          // Mirror x2 onto top-left coordinate system.
          x2 = text1_length - x2;
          if (x1 >= x2) {
            // Overlap detected.
            return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
          }
        }
      }
    }
  }
  // Diff took too long and hit the deadline or
  // number of diffs equals number of characters, no commonality at all.
  return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
};


/**
 * Given the location of the 'middle snake', split the diff in two parts
 * and recurse.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {number} x Index of split point in text1.
 * @param {number} y Index of split point in text2.
 * @param {number} deadline Time at which to bail if not yet complete.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_bisectSplit_ = function(text1, text2, x, y,
    deadline) {
  var text1a = text1.substring(0, x);
  var text2a = text2.substring(0, y);
  var text1b = text1.substring(x);
  var text2b = text2.substring(y);

  // Compute both diffs serially.
  var diffs = this.diff_main(text1a, text2a, false, deadline);
  var diffsb = this.diff_main(text1b, text2b, false, deadline);

  return diffs.concat(diffsb);
};


/**
 * Split two texts into an array of strings.  Reduce the texts to a string of
 * hashes where each Unicode character represents one line.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {!Array.<string|!Array.<string>>} Three element Array, containing the
 *     encoded text1, the encoded text2 and the array of unique strings.  The
 *     zeroth element of the array of unique strings is intentionally blank.
 * @private
 */
diff_match_patch.prototype.diff_linesToChars_ = function(text1, text2) {
  var lineArray = [];  // e.g. lineArray[4] == 'Hello\n'
  var lineHash = {};   // e.g. lineHash['Hello\n'] == 4

  // '\x00' is a valid character, but various debuggers don't like it.
  // So we'll insert a junk entry to avoid generating a null character.
  lineArray[0] = '';

  /**
   * Split a text into an array of strings.  Reduce the texts to a string of
   * hashes where each Unicode character represents one line.
   * Modifies linearray and linehash through being a closure.
   * @param {string} text String to encode.
   * @return {string} Encoded string.
   * @private
   */
  function diff_linesToCharsMunge_(text) {
    var chars = '';
    // Walk the text, pulling out a substring for each line.
    // text.split('\n') would would temporarily double our memory footprint.
    // Modifying text would create many large strings to garbage collect.
    var lineStart = 0;
    var lineEnd = -1;
    // Keeping our own length variable is faster than looking it up.
    var lineArrayLength = lineArray.length;
    while (lineEnd < text.length - 1) {
      lineEnd = text.indexOf('\n', lineStart);
      if (lineEnd == -1) {
        lineEnd = text.length - 1;
      }
      var line = text.substring(lineStart, lineEnd + 1);
      lineStart = lineEnd + 1;

      if (lineHash.hasOwnProperty ? lineHash.hasOwnProperty(line) :
          (lineHash[line] !== undefined)) {
        chars += String.fromCharCode(lineHash[line]);
      } else {
        chars += String.fromCharCode(lineArrayLength);
        lineHash[line] = lineArrayLength;
        lineArray[lineArrayLength++] = line;
      }
    }
    return chars;
  }

  var chars1 = diff_linesToCharsMunge_(text1);
  var chars2 = diff_linesToCharsMunge_(text2);
  return [chars1, chars2, lineArray];
};


/**
 * Rehydrate the text in a diff from a string of line hashes to real lines of
 * text.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @param {!Array.<string>} lineArray Array of unique strings.
 * @private
 */
diff_match_patch.prototype.diff_charsToLines_ = function(diffs, lineArray) {
  for (var x = 0; x < diffs.length; x++) {
    var chars = diffs[x][1];
    var text = [];
    for (var y = 0; y < chars.length; y++) {
      text[y] = lineArray[chars.charCodeAt(y)];
    }
    diffs[x][1] = text.join('');
  }
};


/**
 * Determine the common prefix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the start of each
 *     string.
 */
diff_match_patch.prototype.diff_commonPrefix = function(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerstart = 0;
  while (pointermin < pointermid) {
    if (text1.substring(pointerstart, pointermid) ==
        text2.substring(pointerstart, pointermid)) {
      pointermin = pointermid;
      pointerstart = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Determine the common suffix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the end of each string.
 */
diff_match_patch.prototype.diff_commonSuffix = function(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 ||
      text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerend = 0;
  while (pointermin < pointermid) {
    if (text1.substring(text1.length - pointermid, text1.length - pointerend) ==
        text2.substring(text2.length - pointermid, text2.length - pointerend)) {
      pointermin = pointermid;
      pointerend = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Determine if the suffix of one string is the prefix of another.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the end of the first
 *     string and the start of the second string.
 * @private
 */
diff_match_patch.prototype.diff_commonOverlap_ = function(text1, text2) {
  // Cache the text lengths to prevent multiple calls.
  var text1_length = text1.length;
  var text2_length = text2.length;
  // Eliminate the null case.
  if (text1_length == 0 || text2_length == 0) {
    return 0;
  }
  // Truncate the longer string.
  if (text1_length > text2_length) {
    text1 = text1.substring(text1_length - text2_length);
  } else if (text1_length < text2_length) {
    text2 = text2.substring(0, text1_length);
  }
  var text_length = Math.min(text1_length, text2_length);
  // Quick check for the worst case.
  if (text1 == text2) {
    return text_length;
  }

  // Start by looking for a single character match
  // and increase length until no match is found.
  // Performance analysis: http://neil.fraser.name/news/2010/11/04/
  var best = 0;
  var length = 1;
  while (true) {
    var pattern = text1.substring(text_length - length);
    var found = text2.indexOf(pattern);
    if (found == -1) {
      return best;
    }
    length += found;
    if (found == 0 || text1.substring(text_length - length) ==
        text2.substring(0, length)) {
      best = length;
      length++;
    }
  }
};


/**
 * Do the two texts share a substring which is at least half the length of the
 * longer text?
 * This speedup can produce non-minimal diffs.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {Array.<string>} Five element Array, containing the prefix of
 *     text1, the suffix of text1, the prefix of text2, the suffix of
 *     text2 and the common middle.  Or null if there was no match.
 * @private
 */
diff_match_patch.prototype.diff_halfMatch_ = function(text1, text2) {
  if (this.Diff_Timeout <= 0) {
    // Don't risk returning a non-optimal diff if we have unlimited time.
    return null;
  }
  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
    return null;  // Pointless.
  }
  var dmp = this;  // 'this' becomes 'window' in a closure.

  /**
   * Does a substring of shorttext exist within longtext such that the substring
   * is at least half the length of longtext?
   * Closure, but does not reference any external variables.
   * @param {string} longtext Longer string.
   * @param {string} shorttext Shorter string.
   * @param {number} i Start index of quarter length substring within longtext.
   * @return {Array.<string>} Five element Array, containing the prefix of
   *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
   *     of shorttext and the common middle.  Or null if there was no match.
   * @private
   */
  function diff_halfMatchI_(longtext, shorttext, i) {
    // Start with a 1/4 length substring at position i as a seed.
    var seed = longtext.substring(i, i + Math.floor(longtext.length / 4));
    var j = -1;
    var best_common = '';
    var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
    while ((j = shorttext.indexOf(seed, j + 1)) != -1) {
      var prefixLength = dmp.diff_commonPrefix(longtext.substring(i),
                                               shorttext.substring(j));
      var suffixLength = dmp.diff_commonSuffix(longtext.substring(0, i),
                                               shorttext.substring(0, j));
      if (best_common.length < suffixLength + prefixLength) {
        best_common = shorttext.substring(j - suffixLength, j) +
            shorttext.substring(j, j + prefixLength);
        best_longtext_a = longtext.substring(0, i - suffixLength);
        best_longtext_b = longtext.substring(i + prefixLength);
        best_shorttext_a = shorttext.substring(0, j - suffixLength);
        best_shorttext_b = shorttext.substring(j + prefixLength);
      }
    }
    if (best_common.length * 2 >= longtext.length) {
      return [best_longtext_a, best_longtext_b,
              best_shorttext_a, best_shorttext_b, best_common];
    } else {
      return null;
    }
  }

  // First check if the second quarter is the seed for a half-match.
  var hm1 = diff_halfMatchI_(longtext, shorttext,
                             Math.ceil(longtext.length / 4));
  // Check again based on the third quarter.
  var hm2 = diff_halfMatchI_(longtext, shorttext,
                             Math.ceil(longtext.length / 2));
  var hm;
  if (!hm1 && !hm2) {
    return null;
  } else if (!hm2) {
    hm = hm1;
  } else if (!hm1) {
    hm = hm2;
  } else {
    // Both matched.  Select the longest.
    hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
  }

  // A half-match was found, sort out the return data.
  var text1_a, text1_b, text2_a, text2_b;
  if (text1.length > text2.length) {
    text1_a = hm[0];
    text1_b = hm[1];
    text2_a = hm[2];
    text2_b = hm[3];
  } else {
    text2_a = hm[0];
    text2_b = hm[1];
    text1_a = hm[2];
    text1_b = hm[3];
  }
  var mid_common = hm[4];
  return [text1_a, text1_b, text2_a, text2_b, mid_common];
};


/**
 * Reduce the number of edits by eliminating semantically trivial equalities.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupSemantic = function(diffs) {
  var changes = false;
  var equalities = [];  // Stack of indices where equalities are found.
  var equalitiesLength = 0;  // Keeping our own length var is faster in JS.
  /** @type {?string} */
  var lastequality = null;  // Always equal to equalities[equalitiesLength-1][1]
  var pointer = 0;  // Index of current position.
  // Number of characters that changed prior to the equality.
  var length_insertions1 = 0;
  var length_deletions1 = 0;
  // Number of characters that changed after the equality.
  var length_insertions2 = 0;
  var length_deletions2 = 0;
  while (pointer < diffs.length) {
    if (diffs[pointer][0] == DIFF_EQUAL) {  // Equality found.
      equalities[equalitiesLength++] = pointer;
      length_insertions1 = length_insertions2;
      length_deletions1 = length_deletions2;
      length_insertions2 = 0;
      length_deletions2 = 0;
      lastequality = /** @type {string} */(diffs[pointer][1]);
    } else {  // An insertion or deletion.
      if (diffs[pointer][0] == DIFF_INSERT) {
        length_insertions2 += diffs[pointer][1].length;
      } else {
        length_deletions2 += diffs[pointer][1].length;
      }
      // Eliminate an equality that is smaller or equal to the edits on both
      // sides of it.
      if (lastequality !== null && (lastequality.length <=
          Math.max(length_insertions1, length_deletions1)) &&
          (lastequality.length <= Math.max(length_insertions2,
                                           length_deletions2))) {
        // Duplicate record.
        diffs.splice(equalities[equalitiesLength - 1], 0,
                     [DIFF_DELETE, lastequality]);
        // Change second copy to insert.
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
        // Throw away the equality we just deleted.
        equalitiesLength--;
        // Throw away the previous equality (it needs to be reevaluated).
        equalitiesLength--;
        pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
        length_insertions1 = 0;  // Reset the counters.
        length_deletions1 = 0;
        length_insertions2 = 0;
        length_deletions2 = 0;
        lastequality = null;
        changes = true;
      }
    }
    pointer++;
  }

  // Normalize the diff.
  if (changes) {
    this.diff_cleanupMerge(diffs);
  }
  this.diff_cleanupSemanticLossless(diffs);

  // Find any overlaps between deletions and insertions.
  // e.g: <del>abcxxx</del><ins>xxxdef</ins>
  //   -> <del>abc</del>xxx<ins>def</ins>
  // e.g: <del>xxxabc</del><ins>defxxx</ins>
  //   -> <ins>def</ins>xxx<del>abc</del>
  // Only extract an overlap if it is as big as the edit ahead or behind it.
  pointer = 1;
  while (pointer < diffs.length) {
    if (diffs[pointer - 1][0] == DIFF_DELETE &&
        diffs[pointer][0] == DIFF_INSERT) {
      var deletion = /** @type {string} */(diffs[pointer - 1][1]);
      var insertion = /** @type {string} */(diffs[pointer][1]);
      var overlap_length1 = this.diff_commonOverlap_(deletion, insertion);
      var overlap_length2 = this.diff_commonOverlap_(insertion, deletion);
      if (overlap_length1 >= overlap_length2) {
        if (overlap_length1 >= deletion.length / 2 ||
            overlap_length1 >= insertion.length / 2) {
          // Overlap found.  Insert an equality and trim the surrounding edits.
          diffs.splice(pointer, 0,
              [DIFF_EQUAL, insertion.substring(0, overlap_length1)]);
          diffs[pointer - 1][1] =
              deletion.substring(0, deletion.length - overlap_length1);
          diffs[pointer + 1][1] = insertion.substring(overlap_length1);
          pointer++;
        }
      } else {
        if (overlap_length2 >= deletion.length / 2 ||
            overlap_length2 >= insertion.length / 2) {
          // Reverse overlap found.
          // Insert an equality and swap and trim the surrounding edits.
          diffs.splice(pointer, 0,
              [DIFF_EQUAL, deletion.substring(0, overlap_length2)]);
          diffs[pointer - 1] = [DIFF_INSERT,
              insertion.substring(0, insertion.length - overlap_length2)];
          diffs[pointer + 1] = [DIFF_DELETE,
              deletion.substring(overlap_length2)];
          pointer++;
        }
      }
      pointer++;
    }
    pointer++;
  }
};


/**
 * Look for single edits surrounded on both sides by equalities
 * which can be shifted sideways to align the edit to a word boundary.
 * e.g: The c<ins>at c</ins>ame. -> The <ins>cat </ins>came.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupSemanticLossless = function(diffs) {
  /**
   * Given two strings, compute a score representing whether the internal
   * boundary falls on logical boundaries.
   * Scores range from 6 (best) to 0 (worst).
   * Closure, but does not reference any external variables.
   * @param {string} one First string.
   * @param {string} two Second string.
   * @return {number} The score.
   * @private
   */
  function diff_cleanupSemanticScore_(one, two) {
    if (!one || !two) {
      // Edges are the best.
      return 6;
    }

    // Each port of this function behaves slightly differently due to
    // subtle differences in each language's definition of things like
    // 'whitespace'.  Since this function's purpose is largely cosmetic,
    // the choice has been made to use each language's native features
    // rather than force total conformity.
    var char1 = one.charAt(one.length - 1);
    var char2 = two.charAt(0);
    var nonAlphaNumeric1 = char1.match(diff_match_patch.nonAlphaNumericRegex_);
    var nonAlphaNumeric2 = char2.match(diff_match_patch.nonAlphaNumericRegex_);
    var whitespace1 = nonAlphaNumeric1 &&
        char1.match(diff_match_patch.whitespaceRegex_);
    var whitespace2 = nonAlphaNumeric2 &&
        char2.match(diff_match_patch.whitespaceRegex_);
    var lineBreak1 = whitespace1 &&
        char1.match(diff_match_patch.linebreakRegex_);
    var lineBreak2 = whitespace2 &&
        char2.match(diff_match_patch.linebreakRegex_);
    var blankLine1 = lineBreak1 &&
        one.match(diff_match_patch.blanklineEndRegex_);
    var blankLine2 = lineBreak2 &&
        two.match(diff_match_patch.blanklineStartRegex_);

    if (blankLine1 || blankLine2) {
      // Five points for blank lines.
      return 5;
    } else if (lineBreak1 || lineBreak2) {
      // Four points for line breaks.
      return 4;
    } else if (nonAlphaNumeric1 && !whitespace1 && whitespace2) {
      // Three points for end of sentences.
      return 3;
    } else if (whitespace1 || whitespace2) {
      // Two points for whitespace.
      return 2;
    } else if (nonAlphaNumeric1 || nonAlphaNumeric2) {
      // One point for non-alphanumeric.
      return 1;
    }
    return 0;
  }

  var pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      var equality1 = /** @type {string} */(diffs[pointer - 1][1]);
      var edit = /** @type {string} */(diffs[pointer][1]);
      var equality2 = /** @type {string} */(diffs[pointer + 1][1]);

      // First, shift the edit as far left as possible.
      var commonOffset = this.diff_commonSuffix(equality1, edit);
      if (commonOffset) {
        var commonString = edit.substring(edit.length - commonOffset);
        equality1 = equality1.substring(0, equality1.length - commonOffset);
        edit = commonString + edit.substring(0, edit.length - commonOffset);
        equality2 = commonString + equality2;
      }

      // Second, step character by character right, looking for the best fit.
      var bestEquality1 = equality1;
      var bestEdit = edit;
      var bestEquality2 = equality2;
      var bestScore = diff_cleanupSemanticScore_(equality1, edit) +
          diff_cleanupSemanticScore_(edit, equality2);
      while (edit.charAt(0) === equality2.charAt(0)) {
        equality1 += edit.charAt(0);
        edit = edit.substring(1) + equality2.charAt(0);
        equality2 = equality2.substring(1);
        var score = diff_cleanupSemanticScore_(equality1, edit) +
            diff_cleanupSemanticScore_(edit, equality2);
        // The >= encourages trailing rather than leading whitespace on edits.
        if (score >= bestScore) {
          bestScore = score;
          bestEquality1 = equality1;
          bestEdit = edit;
          bestEquality2 = equality2;
        }
      }

      if (diffs[pointer - 1][1] != bestEquality1) {
        // We have an improvement, save it back to the diff.
        if (bestEquality1) {
          diffs[pointer - 1][1] = bestEquality1;
        } else {
          diffs.splice(pointer - 1, 1);
          pointer--;
        }
        diffs[pointer][1] = bestEdit;
        if (bestEquality2) {
          diffs[pointer + 1][1] = bestEquality2;
        } else {
          diffs.splice(pointer + 1, 1);
          pointer--;
        }
      }
    }
    pointer++;
  }
};

// Define some regex patterns for matching boundaries.
diff_match_patch.nonAlphaNumericRegex_ = /[^a-zA-Z0-9]/;
diff_match_patch.whitespaceRegex_ = /\s/;
diff_match_patch.linebreakRegex_ = /[\r\n]/;
diff_match_patch.blanklineEndRegex_ = /\n\r?\n$/;
diff_match_patch.blanklineStartRegex_ = /^\r?\n\r?\n/;

/**
 * Reduce the number of edits by eliminating operationally trivial equalities.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupEfficiency = function(diffs) {
  var changes = false;
  var equalities = [];  // Stack of indices where equalities are found.
  var equalitiesLength = 0;  // Keeping our own length var is faster in JS.
  var lastequality = '';  // Always equal to equalities[equalitiesLength-1][1]
  var pointer = 0;  // Index of current position.
  // Is there an insertion operation before the last equality.
  var pre_ins = false;
  // Is there a deletion operation before the last equality.
  var pre_del = false;
  // Is there an insertion operation after the last equality.
  var post_ins = false;
  // Is there a deletion operation after the last equality.
  var post_del = false;
  while (pointer < diffs.length) {
    if (diffs[pointer][0] == DIFF_EQUAL) {  // Equality found.
      if (diffs[pointer][1].length < this.Diff_EditCost &&
          (post_ins || post_del)) {
        // Candidate found.
        equalities[equalitiesLength++] = pointer;
        pre_ins = post_ins;
        pre_del = post_del;
        lastequality = diffs[pointer][1];
      } else {
        // Not a candidate, and can never become one.
        equalitiesLength = 0;
        lastequality = '';
      }
      post_ins = post_del = false;
    } else {  // An insertion or deletion.
      if (diffs[pointer][0] == DIFF_DELETE) {
        post_del = true;
      } else {
        post_ins = true;
      }
      /*
       * Five types to be split:
       * <ins>A</ins><del>B</del>XY<ins>C</ins><del>D</del>
       * <ins>A</ins>X<ins>C</ins><del>D</del>
       * <ins>A</ins><del>B</del>X<ins>C</ins>
       * <ins>A</del>X<ins>C</ins><del>D</del>
       * <ins>A</ins><del>B</del>X<del>C</del>
       */
      if (lastequality && ((pre_ins && pre_del && post_ins && post_del) ||
                           ((lastequality.length < this.Diff_EditCost / 2) &&
                            (pre_ins + pre_del + post_ins + post_del) == 3))) {
        // Duplicate record.
        diffs.splice(equalities[equalitiesLength - 1], 0,
                     [DIFF_DELETE, lastequality]);
        // Change second copy to insert.
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
        equalitiesLength--;  // Throw away the equality we just deleted;
        lastequality = '';
        if (pre_ins && pre_del) {
          // No changes made which could affect previous entry, keep going.
          post_ins = post_del = true;
          equalitiesLength = 0;
        } else {
          equalitiesLength--;  // Throw away the previous equality.
          pointer = equalitiesLength > 0 ?
              equalities[equalitiesLength - 1] : -1;
          post_ins = post_del = false;
        }
        changes = true;
      }
    }
    pointer++;
  }

  if (changes) {
    this.diff_cleanupMerge(diffs);
  }
};


/**
 * Reorder and merge like edit sections.  Merge equalities.
 * Any edit section can move as long as it doesn't cross an equality.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupMerge = function(diffs) {
  diffs.push([DIFF_EQUAL, '']);  // Add a dummy entry at the end.
  var pointer = 0;
  var count_delete = 0;
  var count_insert = 0;
  var text_delete = '';
  var text_insert = '';
  var commonlength;
  while (pointer < diffs.length) {
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_EQUAL:
        // Upon reaching an equality, check for prior redundancies.
        if (count_delete + count_insert > 1) {
          if (count_delete !== 0 && count_insert !== 0) {
            // Factor out any common prefixies.
            commonlength = this.diff_commonPrefix(text_insert, text_delete);
            if (commonlength !== 0) {
              if ((pointer - count_delete - count_insert) > 0 &&
                  diffs[pointer - count_delete - count_insert - 1][0] ==
                  DIFF_EQUAL) {
                diffs[pointer - count_delete - count_insert - 1][1] +=
                    text_insert.substring(0, commonlength);
              } else {
                diffs.splice(0, 0, [DIFF_EQUAL,
                                    text_insert.substring(0, commonlength)]);
                pointer++;
              }
              text_insert = text_insert.substring(commonlength);
              text_delete = text_delete.substring(commonlength);
            }
            // Factor out any common suffixies.
            commonlength = this.diff_commonSuffix(text_insert, text_delete);
            if (commonlength !== 0) {
              diffs[pointer][1] = text_insert.substring(text_insert.length -
                  commonlength) + diffs[pointer][1];
              text_insert = text_insert.substring(0, text_insert.length -
                  commonlength);
              text_delete = text_delete.substring(0, text_delete.length -
                  commonlength);
            }
          }
          // Delete the offending records and add the merged ones.
          if (count_delete === 0) {
            diffs.splice(pointer - count_delete - count_insert,
                count_delete + count_insert, [DIFF_INSERT, text_insert]);
          } else if (count_insert === 0) {
            diffs.splice(pointer - count_delete - count_insert,
                count_delete + count_insert, [DIFF_DELETE, text_delete]);
          } else {
            diffs.splice(pointer - count_delete - count_insert,
                count_delete + count_insert, [DIFF_DELETE, text_delete],
                [DIFF_INSERT, text_insert]);
          }
          pointer = pointer - count_delete - count_insert +
                    (count_delete ? 1 : 0) + (count_insert ? 1 : 0) + 1;
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
          // Merge this equality with the previous one.
          diffs[pointer - 1][1] += diffs[pointer][1];
          diffs.splice(pointer, 1);
        } else {
          pointer++;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = '';
        text_insert = '';
        break;
    }
  }
  if (diffs[diffs.length - 1][1] === '') {
    diffs.pop();  // Remove the dummy entry at the end.
  }

  // Second pass: look for single edits surrounded on both sides by equalities
  // which can be shifted sideways to eliminate an equality.
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
  var changes = false;
  pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      if (diffs[pointer][1].substring(diffs[pointer][1].length -
          diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {
        // Shift the edit over the previous equality.
        diffs[pointer][1] = diffs[pointer - 1][1] +
            diffs[pointer][1].substring(0, diffs[pointer][1].length -
                                        diffs[pointer - 1][1].length);
        diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
        diffs.splice(pointer - 1, 1);
        changes = true;
      } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==
          diffs[pointer + 1][1]) {
        // Shift the edit over the next equality.
        diffs[pointer - 1][1] += diffs[pointer + 1][1];
        diffs[pointer][1] =
            diffs[pointer][1].substring(diffs[pointer + 1][1].length) +
            diffs[pointer + 1][1];
        diffs.splice(pointer + 1, 1);
        changes = true;
      }
    }
    pointer++;
  }
  // If shifts were made, the diff needs reordering and another shift sweep.
  if (changes) {
    this.diff_cleanupMerge(diffs);
  }
};


/**
 * loc is a location in text1, compute and return the equivalent location in
 * text2.
 * e.g. 'The cat' vs 'The big cat', 1->1, 5->8
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @param {number} loc Location within text1.
 * @return {number} Location within text2.
 */
diff_match_patch.prototype.diff_xIndex = function(diffs, loc) {
  var chars1 = 0;
  var chars2 = 0;
  var last_chars1 = 0;
  var last_chars2 = 0;
  var x;
  for (x = 0; x < diffs.length; x++) {
    if (diffs[x][0] !== DIFF_INSERT) {  // Equality or deletion.
      chars1 += diffs[x][1].length;
    }
    if (diffs[x][0] !== DIFF_DELETE) {  // Equality or insertion.
      chars2 += diffs[x][1].length;
    }
    if (chars1 > loc) {  // Overshot the location.
      break;
    }
    last_chars1 = chars1;
    last_chars2 = chars2;
  }
  // Was the location was deleted?
  if (diffs.length != x && diffs[x][0] === DIFF_DELETE) {
    return last_chars2;
  }
  // Add the remaining character length.
  return last_chars2 + (loc - last_chars1);
};


/**
 * Convert a diff array into a pretty HTML report.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @return {string} HTML representation.
 */
diff_match_patch.prototype.diff_prettyHtml = function(diffs) {
  var html = [];
  var pattern_amp = /&/g;
  var pattern_lt = /</g;
  var pattern_gt = />/g;
  var pattern_para = /\n/g;
  for (var x = 0; x < diffs.length; x++) {
    var op = diffs[x][0];    // Operation (insert, delete, equal)
    var data = diffs[x][1];  // Text of change.
    var text = data.replace(pattern_amp, '&amp;').replace(pattern_lt, '&lt;')
        .replace(pattern_gt, '&gt;').replace(pattern_para, '&para;<br>');
    switch (op) {
      case DIFF_INSERT:
        html[x] = '<ins style="background:#e6ffe6;">' + text + '</ins>';
        break;
      case DIFF_DELETE:
        html[x] = '<del style="background:#ffe6e6;">' + text + '</del>';
        break;
      case DIFF_EQUAL:
        html[x] = '<span>' + text + '</span>';
        break;
    }
  }
  return html.join('');
};


/**
 * Compute and return the source text (all equalities and deletions).
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @return {string} Source text.
 */
diff_match_patch.prototype.diff_text1 = function(diffs) {
  var text = [];
  for (var x = 0; x < diffs.length; x++) {
    if (diffs[x][0] !== DIFF_INSERT) {
      text[x] = diffs[x][1];
    }
  }
  return text.join('');
};


/**
 * Compute and return the destination text (all equalities and insertions).
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @return {string} Destination text.
 */
diff_match_patch.prototype.diff_text2 = function(diffs) {
  var text = [];
  for (var x = 0; x < diffs.length; x++) {
    if (diffs[x][0] !== DIFF_DELETE) {
      text[x] = diffs[x][1];
    }
  }
  return text.join('');
};


/**
 * Compute the Levenshtein distance; the number of inserted, deleted or
 * substituted characters.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @return {number} Number of changes.
 */
diff_match_patch.prototype.diff_levenshtein = function(diffs) {
  var levenshtein = 0;
  var insertions = 0;
  var deletions = 0;
  for (var x = 0; x < diffs.length; x++) {
    var op = diffs[x][0];
    var data = diffs[x][1];
    switch (op) {
      case DIFF_INSERT:
        insertions += data.length;
        break;
      case DIFF_DELETE:
        deletions += data.length;
        break;
      case DIFF_EQUAL:
        // A deletion and an insertion is one substitution.
        levenshtein += Math.max(insertions, deletions);
        insertions = 0;
        deletions = 0;
        break;
    }
  }
  levenshtein += Math.max(insertions, deletions);
  return levenshtein;
};


/**
 * Crush the diff into an encoded string which describes the operations
 * required to transform text1 into text2.
 * E.g. =3\t-2\t+ing  -> Keep 3 chars, delete 2 chars, insert 'ing'.
 * Operations are tab-separated.  Inserted text is escaped using %xx notation.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @return {string} Delta text.
 */
diff_match_patch.prototype.diff_toDelta = function(diffs) {
  var text = [];
  for (var x = 0; x < diffs.length; x++) {
    switch (diffs[x][0]) {
      case DIFF_INSERT:
        text[x] = '+' + encodeURI(diffs[x][1]);
        break;
      case DIFF_DELETE:
        text[x] = '-' + diffs[x][1].length;
        break;
      case DIFF_EQUAL:
        text[x] = '=' + diffs[x][1].length;
        break;
    }
  }
  return text.join('\t').replace(/%20/g, ' ');
};


/**
 * Given the original text1, and an encoded string which describes the
 * operations required to transform text1 into text2, compute the full diff.
 * @param {string} text1 Source string for the diff.
 * @param {string} delta Delta text.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 * @throws {!Error} If invalid input.
 */
diff_match_patch.prototype.diff_fromDelta = function(text1, delta) {
  var diffs = [];
  var diffsLength = 0;  // Keeping our own length var is faster in JS.
  var pointer = 0;  // Cursor in text1
  var tokens = delta.split(/\t/g);
  for (var x = 0; x < tokens.length; x++) {
    // Each token begins with a one character parameter which specifies the
    // operation of this token (delete, insert, equality).
    var param = tokens[x].substring(1);
    switch (tokens[x].charAt(0)) {
      case '+':
        try {
          diffs[diffsLength++] = [DIFF_INSERT, decodeURI(param)];
        } catch (ex) {
          // Malformed URI sequence.
          throw new Error('Illegal escape in diff_fromDelta: ' + param);
        }
        break;
      case '-':
        // Fall through.
      case '=':
        var n = parseInt(param, 10);
        if (isNaN(n) || n < 0) {
          throw new Error('Invalid number in diff_fromDelta: ' + param);
        }
        var text = text1.substring(pointer, pointer += n);
        if (tokens[x].charAt(0) == '=') {
          diffs[diffsLength++] = [DIFF_EQUAL, text];
        } else {
          diffs[diffsLength++] = [DIFF_DELETE, text];
        }
        break;
      default:
        // Blank tokens are ok (from a trailing \t).
        // Anything else is an error.
        if (tokens[x]) {
          throw new Error('Invalid diff operation in diff_fromDelta: ' +
                          tokens[x]);
        }
    }
  }
  if (pointer != text1.length) {
    throw new Error('Delta length (' + pointer +
        ') does not equal source text length (' + text1.length + ').');
  }
  return diffs;
};


//  MATCH FUNCTIONS


/**
 * Locate the best instance of 'pattern' in 'text' near 'loc'.
 * @param {string} text The text to search.
 * @param {string} pattern The pattern to search for.
 * @param {number} loc The location to search around.
 * @return {number} Best match index or -1.
 */
diff_match_patch.prototype.match_main = function(text, pattern, loc) {
  // Check for null inputs.
  if (text == null || pattern == null || loc == null) {
    throw new Error('Null input. (match_main)');
  }

  loc = Math.max(0, Math.min(loc, text.length));
  if (text == pattern) {
    // Shortcut (potentially not guaranteed by the algorithm)
    return 0;
  } else if (!text.length) {
    // Nothing to match.
    return -1;
  } else if (text.substring(loc, loc + pattern.length) == pattern) {
    // Perfect match at the perfect spot!  (Includes case of null pattern)
    return loc;
  } else {
    // Do a fuzzy compare.
    return this.match_bitap_(text, pattern, loc);
  }
};


/**
 * Locate the best instance of 'pattern' in 'text' near 'loc' using the
 * Bitap algorithm.
 * @param {string} text The text to search.
 * @param {string} pattern The pattern to search for.
 * @param {number} loc The location to search around.
 * @return {number} Best match index or -1.
 * @private
 */
diff_match_patch.prototype.match_bitap_ = function(text, pattern, loc) {
  if (pattern.length > this.Match_MaxBits) {
    throw new Error('Pattern too long for this browser.');
  }

  // Initialise the alphabet.
  var s = this.match_alphabet_(pattern);

  var dmp = this;  // 'this' becomes 'window' in a closure.

  /**
   * Compute and return the score for a match with e errors and x location.
   * Accesses loc and pattern through being a closure.
   * @param {number} e Number of errors in match.
   * @param {number} x Location of match.
   * @return {number} Overall score for match (0.0 = good, 1.0 = bad).
   * @private
   */
  function match_bitapScore_(e, x) {
    var accuracy = e / pattern.length;
    var proximity = Math.abs(loc - x);
    if (!dmp.Match_Distance) {
      // Dodge divide by zero error.
      return proximity ? 1.0 : accuracy;
    }
    return accuracy + (proximity / dmp.Match_Distance);
  }

  // Highest score beyond which we give up.
  var score_threshold = this.Match_Threshold;
  // Is there a nearby exact match? (speedup)
  var best_loc = text.indexOf(pattern, loc);
  if (best_loc != -1) {
    score_threshold = Math.min(match_bitapScore_(0, best_loc), score_threshold);
    // What about in the other direction? (speedup)
    best_loc = text.lastIndexOf(pattern, loc + pattern.length);
    if (best_loc != -1) {
      score_threshold =
          Math.min(match_bitapScore_(0, best_loc), score_threshold);
    }
  }

  // Initialise the bit arrays.
  var matchmask = 1 << (pattern.length - 1);
  best_loc = -1;

  var bin_min, bin_mid;
  var bin_max = pattern.length + text.length;
  var last_rd;
  for (var d = 0; d < pattern.length; d++) {
    // Scan for the best match; each iteration allows for one more error.
    // Run a binary search to determine how far from 'loc' we can stray at this
    // error level.
    bin_min = 0;
    bin_mid = bin_max;
    while (bin_min < bin_mid) {
      if (match_bitapScore_(d, loc + bin_mid) <= score_threshold) {
        bin_min = bin_mid;
      } else {
        bin_max = bin_mid;
      }
      bin_mid = Math.floor((bin_max - bin_min) / 2 + bin_min);
    }
    // Use the result from this iteration as the maximum for the next.
    bin_max = bin_mid;
    var start = Math.max(1, loc - bin_mid + 1);
    var finish = Math.min(loc + bin_mid, text.length) + pattern.length;

    var rd = Array(finish + 2);
    rd[finish + 1] = (1 << d) - 1;
    for (var j = finish; j >= start; j--) {
      // The alphabet (s) is a sparse hash, so the following line generates
      // warnings.
      var charMatch = s[text.charAt(j - 1)];
      if (d === 0) {  // First pass: exact match.
        rd[j] = ((rd[j + 1] << 1) | 1) & charMatch;
      } else {  // Subsequent passes: fuzzy match.
        rd[j] = ((rd[j + 1] << 1) | 1) & charMatch |
                (((last_rd[j + 1] | last_rd[j]) << 1) | 1) |
                last_rd[j + 1];
      }
      if (rd[j] & matchmask) {
        var score = match_bitapScore_(d, j - 1);
        // This match will almost certainly be better than any existing match.
        // But check anyway.
        if (score <= score_threshold) {
          // Told you so.
          score_threshold = score;
          best_loc = j - 1;
          if (best_loc > loc) {
            // When passing loc, don't exceed our current distance from loc.
            start = Math.max(1, 2 * loc - best_loc);
          } else {
            // Already passed loc, downhill from here on in.
            break;
          }
        }
      }
    }
    // No hope for a (better) match at greater error levels.
    if (match_bitapScore_(d + 1, loc) > score_threshold) {
      break;
    }
    last_rd = rd;
  }
  return best_loc;
};


/**
 * Initialise the alphabet for the Bitap algorithm.
 * @param {string} pattern The text to encode.
 * @return {!Object} Hash of character locations.
 * @private
 */
diff_match_patch.prototype.match_alphabet_ = function(pattern) {
  var s = {};
  for (var i = 0; i < pattern.length; i++) {
    s[pattern.charAt(i)] = 0;
  }
  for (var i = 0; i < pattern.length; i++) {
    s[pattern.charAt(i)] |= 1 << (pattern.length - i - 1);
  }
  return s;
};


//  PATCH FUNCTIONS


/**
 * Increase the context until it is unique,
 * but don't let the pattern expand beyond Match_MaxBits.
 * @param {!diff_match_patch.patch_obj} patch The patch to grow.
 * @param {string} text Source text.
 * @private
 */
diff_match_patch.prototype.patch_addContext_ = function(patch, text) {
  if (text.length == 0) {
    return;
  }
  var pattern = text.substring(patch.start2, patch.start2 + patch.length1);
  var padding = 0;

  // Look for the first and last matches of pattern in text.  If two different
  // matches are found, increase the pattern length.
  while (text.indexOf(pattern) != text.lastIndexOf(pattern) &&
         pattern.length < this.Match_MaxBits - this.Patch_Margin -
         this.Patch_Margin) {
    padding += this.Patch_Margin;
    pattern = text.substring(patch.start2 - padding,
                             patch.start2 + patch.length1 + padding);
  }
  // Add one chunk for good luck.
  padding += this.Patch_Margin;

  // Add the prefix.
  var prefix = text.substring(patch.start2 - padding, patch.start2);
  if (prefix) {
    patch.diffs.unshift([DIFF_EQUAL, prefix]);
  }
  // Add the suffix.
  var suffix = text.substring(patch.start2 + patch.length1,
                              patch.start2 + patch.length1 + padding);
  if (suffix) {
    patch.diffs.push([DIFF_EQUAL, suffix]);
  }

  // Roll back the start points.
  patch.start1 -= prefix.length;
  patch.start2 -= prefix.length;
  // Extend the lengths.
  patch.length1 += prefix.length + suffix.length;
  patch.length2 += prefix.length + suffix.length;
};


/**
 * Compute a list of patches to turn text1 into text2.
 * Use diffs if provided, otherwise compute it ourselves.
 * There are four ways to call this function, depending on what data is
 * available to the caller:
 * Method 1:
 * a = text1, b = text2
 * Method 2:
 * a = diffs
 * Method 3 (optimal):
 * a = text1, b = diffs
 * Method 4 (deprecated, use method 3):
 * a = text1, b = text2, c = diffs
 *
 * @param {string|!Array.<!diff_match_patch.Diff>} a text1 (methods 1,3,4) or
 * Array of diff tuples for text1 to text2 (method 2).
 * @param {string|!Array.<!diff_match_patch.Diff>} opt_b text2 (methods 1,4) or
 * Array of diff tuples for text1 to text2 (method 3) or undefined (method 2).
 * @param {string|!Array.<!diff_match_patch.Diff>} opt_c Array of diff tuples
 * for text1 to text2 (method 4) or undefined (methods 1,2,3).
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of patch objects.
 */
diff_match_patch.prototype.patch_make = function(a, opt_b, opt_c) {
  var text1, diffs;
  if (typeof a == 'string' && typeof opt_b == 'string' &&
      typeof opt_c == 'undefined') {
    // Method 1: text1, text2
    // Compute diffs from text1 and text2.
    text1 = /** @type {string} */(a);
    diffs = this.diff_main(text1, /** @type {string} */(opt_b), true);
    if (diffs.length > 2) {
      this.diff_cleanupSemantic(diffs);
      this.diff_cleanupEfficiency(diffs);
    }
  } else if (a && typeof a == 'object' && typeof opt_b == 'undefined' &&
      typeof opt_c == 'undefined') {
    // Method 2: diffs
    // Compute text1 from diffs.
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(a);
    text1 = this.diff_text1(diffs);
  } else if (typeof a == 'string' && opt_b && typeof opt_b == 'object' &&
      typeof opt_c == 'undefined') {
    // Method 3: text1, diffs
    text1 = /** @type {string} */(a);
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(opt_b);
  } else if (typeof a == 'string' && typeof opt_b == 'string' &&
      opt_c && typeof opt_c == 'object') {
    // Method 4: text1, text2, diffs
    // text2 is not used.
    text1 = /** @type {string} */(a);
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(opt_c);
  } else {
    throw new Error('Unknown call format to patch_make.');
  }

  if (diffs.length === 0) {
    return [];  // Get rid of the null case.
  }
  var patches = [];
  var patch = new diff_match_patch.patch_obj();
  var patchDiffLength = 0;  // Keeping our own length var is faster in JS.
  var char_count1 = 0;  // Number of characters into the text1 string.
  var char_count2 = 0;  // Number of characters into the text2 string.
  // Start with text1 (prepatch_text) and apply the diffs until we arrive at
  // text2 (postpatch_text).  We recreate the patches one by one to determine
  // context info.
  var prepatch_text = text1;
  var postpatch_text = text1;
  for (var x = 0; x < diffs.length; x++) {
    var diff_type = diffs[x][0];
    var diff_text = diffs[x][1];

    if (!patchDiffLength && diff_type !== DIFF_EQUAL) {
      // A new patch starts here.
      patch.start1 = char_count1;
      patch.start2 = char_count2;
    }

    switch (diff_type) {
      case DIFF_INSERT:
        patch.diffs[patchDiffLength++] = diffs[x];
        patch.length2 += diff_text.length;
        postpatch_text = postpatch_text.substring(0, char_count2) + diff_text +
                         postpatch_text.substring(char_count2);
        break;
      case DIFF_DELETE:
        patch.length1 += diff_text.length;
        patch.diffs[patchDiffLength++] = diffs[x];
        postpatch_text = postpatch_text.substring(0, char_count2) +
                         postpatch_text.substring(char_count2 +
                             diff_text.length);
        break;
      case DIFF_EQUAL:
        if (diff_text.length <= 2 * this.Patch_Margin &&
            patchDiffLength && diffs.length != x + 1) {
          // Small equality inside a patch.
          patch.diffs[patchDiffLength++] = diffs[x];
          patch.length1 += diff_text.length;
          patch.length2 += diff_text.length;
        } else if (diff_text.length >= 2 * this.Patch_Margin) {
          // Time for a new patch.
          if (patchDiffLength) {
            this.patch_addContext_(patch, prepatch_text);
            patches.push(patch);
            patch = new diff_match_patch.patch_obj();
            patchDiffLength = 0;
            // Unlike Unidiff, our patch lists have a rolling context.
            // http://code.google.com/p/google-diff-match-patch/wiki/Unidiff
            // Update prepatch text & pos to reflect the application of the
            // just completed patch.
            prepatch_text = postpatch_text;
            char_count1 = char_count2;
          }
        }
        break;
    }

    // Update the current character count.
    if (diff_type !== DIFF_INSERT) {
      char_count1 += diff_text.length;
    }
    if (diff_type !== DIFF_DELETE) {
      char_count2 += diff_text.length;
    }
  }
  // Pick up the leftover patch if not empty.
  if (patchDiffLength) {
    this.patch_addContext_(patch, prepatch_text);
    patches.push(patch);
  }

  return patches;
};


/**
 * Given an array of patches, return another array that is identical.
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of patch objects.
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of patch objects.
 */
diff_match_patch.prototype.patch_deepCopy = function(patches) {
  // Making deep copies is hard in JavaScript.
  var patchesCopy = [];
  for (var x = 0; x < patches.length; x++) {
    var patch = patches[x];
    var patchCopy = new diff_match_patch.patch_obj();
    patchCopy.diffs = [];
    for (var y = 0; y < patch.diffs.length; y++) {
      patchCopy.diffs[y] = patch.diffs[y].slice();
    }
    patchCopy.start1 = patch.start1;
    patchCopy.start2 = patch.start2;
    patchCopy.length1 = patch.length1;
    patchCopy.length2 = patch.length2;
    patchesCopy[x] = patchCopy;
  }
  return patchesCopy;
};


/**
 * Merge a set of patches onto the text.  Return a patched text, as well
 * as a list of true/false values indicating which patches were applied.
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of patch objects.
 * @param {string} text Old text.
 * @return {!Array.<string|!Array.<boolean>>} Two element Array, containing the
 *      new text and an array of boolean values.
 */
diff_match_patch.prototype.patch_apply = function(patches, text) {
  if (patches.length == 0) {
    return [text, []];
  }

  // Deep copy the patches so that no changes are made to originals.
  patches = this.patch_deepCopy(patches);

  var nullPadding = this.patch_addPadding(patches);
  text = nullPadding + text + nullPadding;

  this.patch_splitMax(patches);
  // delta keeps track of the offset between the expected and actual location
  // of the previous patch.  If there are patches expected at positions 10 and
  // 20, but the first patch was found at 12, delta is 2 and the second patch
  // has an effective expected position of 22.
  var delta = 0;
  var results = [];
  for (var x = 0; x < patches.length; x++) {
    var expected_loc = patches[x].start2 + delta;
    var text1 = this.diff_text1(patches[x].diffs);
    var start_loc;
    var end_loc = -1;
    if (text1.length > this.Match_MaxBits) {
      // patch_splitMax will only provide an oversized pattern in the case of
      // a monster delete.
      start_loc = this.match_main(text, text1.substring(0, this.Match_MaxBits),
                                  expected_loc);
      if (start_loc != -1) {
        end_loc = this.match_main(text,
            text1.substring(text1.length - this.Match_MaxBits),
            expected_loc + text1.length - this.Match_MaxBits);
        if (end_loc == -1 || start_loc >= end_loc) {
          // Can't find valid trailing context.  Drop this patch.
          start_loc = -1;
        }
      }
    } else {
      start_loc = this.match_main(text, text1, expected_loc);
    }
    if (start_loc == -1) {
      // No match found.  :(
      results[x] = false;
      // Subtract the delta for this failed patch from subsequent patches.
      delta -= patches[x].length2 - patches[x].length1;
    } else {
      // Found a match.  :)
      results[x] = true;
      delta = start_loc - expected_loc;
      var text2;
      if (end_loc == -1) {
        text2 = text.substring(start_loc, start_loc + text1.length);
      } else {
        text2 = text.substring(start_loc, end_loc + this.Match_MaxBits);
      }
      if (text1 == text2) {
        // Perfect match, just shove the replacement text in.
        text = text.substring(0, start_loc) +
               this.diff_text2(patches[x].diffs) +
               text.substring(start_loc + text1.length);
      } else {
        // Imperfect match.  Run a diff to get a framework of equivalent
        // indices.
        var diffs = this.diff_main(text1, text2, false);
        if (text1.length > this.Match_MaxBits &&
            this.diff_levenshtein(diffs) / text1.length >
            this.Patch_DeleteThreshold) {
          // The end points match, but the content is unacceptably bad.
          results[x] = false;
        } else {
          this.diff_cleanupSemanticLossless(diffs);
          var index1 = 0;
          var index2;
          for (var y = 0; y < patches[x].diffs.length; y++) {
            var mod = patches[x].diffs[y];
            if (mod[0] !== DIFF_EQUAL) {
              index2 = this.diff_xIndex(diffs, index1);
            }
            if (mod[0] === DIFF_INSERT) {  // Insertion
              text = text.substring(0, start_loc + index2) + mod[1] +
                     text.substring(start_loc + index2);
            } else if (mod[0] === DIFF_DELETE) {  // Deletion
              text = text.substring(0, start_loc + index2) +
                     text.substring(start_loc + this.diff_xIndex(diffs,
                         index1 + mod[1].length));
            }
            if (mod[0] !== DIFF_DELETE) {
              index1 += mod[1].length;
            }
          }
        }
      }
    }
  }
  // Strip the padding off.
  text = text.substring(nullPadding.length, text.length - nullPadding.length);
  return [text, results];
};


/**
 * Add some padding on text start and end so that edges can match something.
 * Intended to be called only from within patch_apply.
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of patch objects.
 * @return {string} The padding string added to each side.
 */
diff_match_patch.prototype.patch_addPadding = function(patches) {
  var paddingLength = this.Patch_Margin;
  var nullPadding = '';
  for (var x = 1; x <= paddingLength; x++) {
    nullPadding += String.fromCharCode(x);
  }

  // Bump all the patches forward.
  for (var x = 0; x < patches.length; x++) {
    patches[x].start1 += paddingLength;
    patches[x].start2 += paddingLength;
  }

  // Add some padding on start of first diff.
  var patch = patches[0];
  var diffs = patch.diffs;
  if (diffs.length == 0 || diffs[0][0] != DIFF_EQUAL) {
    // Add nullPadding equality.
    diffs.unshift([DIFF_EQUAL, nullPadding]);
    patch.start1 -= paddingLength;  // Should be 0.
    patch.start2 -= paddingLength;  // Should be 0.
    patch.length1 += paddingLength;
    patch.length2 += paddingLength;
  } else if (paddingLength > diffs[0][1].length) {
    // Grow first equality.
    var extraLength = paddingLength - diffs[0][1].length;
    diffs[0][1] = nullPadding.substring(diffs[0][1].length) + diffs[0][1];
    patch.start1 -= extraLength;
    patch.start2 -= extraLength;
    patch.length1 += extraLength;
    patch.length2 += extraLength;
  }

  // Add some padding on end of last diff.
  patch = patches[patches.length - 1];
  diffs = patch.diffs;
  if (diffs.length == 0 || diffs[diffs.length - 1][0] != DIFF_EQUAL) {
    // Add nullPadding equality.
    diffs.push([DIFF_EQUAL, nullPadding]);
    patch.length1 += paddingLength;
    patch.length2 += paddingLength;
  } else if (paddingLength > diffs[diffs.length - 1][1].length) {
    // Grow last equality.
    var extraLength = paddingLength - diffs[diffs.length - 1][1].length;
    diffs[diffs.length - 1][1] += nullPadding.substring(0, extraLength);
    patch.length1 += extraLength;
    patch.length2 += extraLength;
  }

  return nullPadding;
};


/**
 * Look through the patches and break up any which are longer than the maximum
 * limit of the match algorithm.
 * Intended to be called only from within patch_apply.
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of patch objects.
 */
diff_match_patch.prototype.patch_splitMax = function(patches) {
  var patch_size = this.Match_MaxBits;
  for (var x = 0; x < patches.length; x++) {
    if (patches[x].length1 > patch_size) {
      var bigpatch = patches[x];
      // Remove the big old patch.
      patches.splice(x--, 1);
      var start1 = bigpatch.start1;
      var start2 = bigpatch.start2;
      var precontext = '';
      while (bigpatch.diffs.length !== 0) {
        // Create one of several smaller patches.
        var patch = new diff_match_patch.patch_obj();
        var empty = true;
        patch.start1 = start1 - precontext.length;
        patch.start2 = start2 - precontext.length;
        if (precontext !== '') {
          patch.length1 = patch.length2 = precontext.length;
          patch.diffs.push([DIFF_EQUAL, precontext]);
        }
        while (bigpatch.diffs.length !== 0 &&
               patch.length1 < patch_size - this.Patch_Margin) {
          var diff_type = bigpatch.diffs[0][0];
          var diff_text = bigpatch.diffs[0][1];
          if (diff_type === DIFF_INSERT) {
            // Insertions are harmless.
            patch.length2 += diff_text.length;
            start2 += diff_text.length;
            patch.diffs.push(bigpatch.diffs.shift());
            empty = false;
          } else if (diff_type === DIFF_DELETE && patch.diffs.length == 1 &&
                     patch.diffs[0][0] == DIFF_EQUAL &&
                     diff_text.length > 2 * patch_size) {
            // This is a large deletion.  Let it pass in one chunk.
            patch.length1 += diff_text.length;
            start1 += diff_text.length;
            empty = false;
            patch.diffs.push([diff_type, diff_text]);
            bigpatch.diffs.shift();
          } else {
            // Deletion or equality.  Only take as much as we can stomach.
            diff_text = diff_text.substring(0,
                patch_size - patch.length1 - this.Patch_Margin);
            patch.length1 += diff_text.length;
            start1 += diff_text.length;
            if (diff_type === DIFF_EQUAL) {
              patch.length2 += diff_text.length;
              start2 += diff_text.length;
            } else {
              empty = false;
            }
            patch.diffs.push([diff_type, diff_text]);
            if (diff_text == bigpatch.diffs[0][1]) {
              bigpatch.diffs.shift();
            } else {
              bigpatch.diffs[0][1] =
                  bigpatch.diffs[0][1].substring(diff_text.length);
            }
          }
        }
        // Compute the head context for the next patch.
        precontext = this.diff_text2(patch.diffs);
        precontext =
            precontext.substring(precontext.length - this.Patch_Margin);
        // Append the end context for this patch.
        var postcontext = this.diff_text1(bigpatch.diffs)
                              .substring(0, this.Patch_Margin);
        if (postcontext !== '') {
          patch.length1 += postcontext.length;
          patch.length2 += postcontext.length;
          if (patch.diffs.length !== 0 &&
              patch.diffs[patch.diffs.length - 1][0] === DIFF_EQUAL) {
            patch.diffs[patch.diffs.length - 1][1] += postcontext;
          } else {
            patch.diffs.push([DIFF_EQUAL, postcontext]);
          }
        }
        if (!empty) {
          patches.splice(++x, 0, patch);
        }
      }
    }
  }
};


/**
 * Take a list of patches and return a textual representation.
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of patch objects.
 * @return {string} Text representation of patches.
 */
diff_match_patch.prototype.patch_toText = function(patches) {
  var text = [];
  for (var x = 0; x < patches.length; x++) {
    text[x] = patches[x];
  }
  return text.join('');
};


/**
 * Parse a textual representation of patches and return a list of patch objects.
 * @param {string} textline Text representation of patches.
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of patch objects.
 * @throws {!Error} If invalid input.
 */
diff_match_patch.prototype.patch_fromText = function(textline) {
  var patches = [];
  if (!textline) {
    return patches;
  }
  var text = textline.split('\n');
  var textPointer = 0;
  var patchHeader = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@$/;
  while (textPointer < text.length) {
    var m = text[textPointer].match(patchHeader);
    if (!m) {
      throw new Error('Invalid patch string: ' + text[textPointer]);
    }
    var patch = new diff_match_patch.patch_obj();
    patches.push(patch);
    patch.start1 = parseInt(m[1], 10);
    if (m[2] === '') {
      patch.start1--;
      patch.length1 = 1;
    } else if (m[2] == '0') {
      patch.length1 = 0;
    } else {
      patch.start1--;
      patch.length1 = parseInt(m[2], 10);
    }

    patch.start2 = parseInt(m[3], 10);
    if (m[4] === '') {
      patch.start2--;
      patch.length2 = 1;
    } else if (m[4] == '0') {
      patch.length2 = 0;
    } else {
      patch.start2--;
      patch.length2 = parseInt(m[4], 10);
    }
    textPointer++;

    while (textPointer < text.length) {
      var sign = text[textPointer].charAt(0);
      try {
        var line = decodeURI(text[textPointer].substring(1));
      } catch (ex) {
        // Malformed URI sequence.
        throw new Error('Illegal escape in patch_fromText: ' + line);
      }
      if (sign == '-') {
        // Deletion.
        patch.diffs.push([DIFF_DELETE, line]);
      } else if (sign == '+') {
        // Insertion.
        patch.diffs.push([DIFF_INSERT, line]);
      } else if (sign == ' ') {
        // Minor equality.
        patch.diffs.push([DIFF_EQUAL, line]);
      } else if (sign == '@') {
        // Start of next patch.
        break;
      } else if (sign === '') {
        // Blank line?  Whatever.
      } else {
        // WTF?
        throw new Error('Invalid patch mode "' + sign + '" in: ' + line);
      }
      textPointer++;
    }
  }
  return patches;
};


/**
 * Class representing one patch operation.
 * @constructor
 */
diff_match_patch.patch_obj = function() {
  /** @type {!Array.<!diff_match_patch.Diff>} */
  this.diffs = [];
  /** @type {?number} */
  this.start1 = null;
  /** @type {?number} */
  this.start2 = null;
  /** @type {number} */
  this.length1 = 0;
  /** @type {number} */
  this.length2 = 0;
};


/**
 * Emmulate GNU diff's format.
 * Header: @@ -382,8 +481,9 @@
 * Indicies are printed as 1-based, not 0-based.
 * @return {string} The GNU diff string.
 */
diff_match_patch.patch_obj.prototype.toString = function() {
  var coords1, coords2;
  if (this.length1 === 0) {
    coords1 = this.start1 + ',0';
  } else if (this.length1 == 1) {
    coords1 = this.start1 + 1;
  } else {
    coords1 = (this.start1 + 1) + ',' + this.length1;
  }
  if (this.length2 === 0) {
    coords2 = this.start2 + ',0';
  } else if (this.length2 == 1) {
    coords2 = this.start2 + 1;
  } else {
    coords2 = (this.start2 + 1) + ',' + this.length2;
  }
  var text = ['@@ -' + coords1 + ' +' + coords2 + ' @@\n'];
  var op;
  // Escape the body of the patch with %xx notation.
  for (var x = 0; x < this.diffs.length; x++) {
    switch (this.diffs[x][0]) {
      case DIFF_INSERT:
        op = '+';
        break;
      case DIFF_DELETE:
        op = '-';
        break;
      case DIFF_EQUAL:
        op = ' ';
        break;
    }
    text[x + 1] = op + encodeURI(this.diffs[x][1]) + '\n';
  }
  return text.join('').replace(/%20/g, ' ');
};


// Export these global variables so that they survive Google's JS compiler.
// In a browser, 'this' will be 'window'.
// Users of node.js should 'require' the uncompressed version since Google's
// JS compiler may break the following exports for non-browser environments.
this['diff_match_patch'] = diff_match_patch;
this['DIFF_DELETE'] = DIFF_DELETE;
this['DIFF_INSERT'] = DIFF_INSERT;
this['DIFF_EQUAL'] = DIFF_EQUAL;
  /*! jQuery v1.7.2 jquery.com | jquery.org/license */
(function(a,b){function cy(a){return f.isWindow(a)?a:a.nodeType===9?a.defaultView||a.parentWindow:!1}function cu(a){if(!cj[a]){var b=c.body,d=f("<"+a+">").appendTo(b),e=d.css("display");d.remove();if(e==="none"||e===""){ck||(ck=c.createElement("iframe"),ck.frameBorder=ck.width=ck.height=0),b.appendChild(ck);if(!cl||!ck.createElement)cl=(ck.contentWindow||ck.contentDocument).document,cl.write((f.support.boxModel?"<!doctype html>":"")+"<html><body>"),cl.close();d=cl.createElement(a),cl.body.appendChild(d),e=f.css(d,"display"),b.removeChild(ck)}cj[a]=e}return cj[a]}function ct(a,b){var c={};f.each(cp.concat.apply([],cp.slice(0,b)),function(){c[this]=a});return c}function cs(){cq=b}function cr(){setTimeout(cs,0);return cq=f.now()}function ci(){try{return new a.ActiveXObject("Microsoft.XMLHTTP")}catch(b){}}function ch(){try{return new a.XMLHttpRequest}catch(b){}}function cb(a,c){a.dataFilter&&(c=a.dataFilter(c,a.dataType));var d=a.dataTypes,e={},g,h,i=d.length,j,k=d[0],l,m,n,o,p;for(g=1;g<i;g++){if(g===1)for(h in a.converters)typeof h=="string"&&(e[h.toLowerCase()]=a.converters[h]);l=k,k=d[g];if(k==="*")k=l;else if(l!=="*"&&l!==k){m=l+" "+k,n=e[m]||e["* "+k];if(!n){p=b;for(o in e){j=o.split(" ");if(j[0]===l||j[0]==="*"){p=e[j[1]+" "+k];if(p){o=e[o],o===!0?n=p:p===!0&&(n=o);break}}}}!n&&!p&&f.error("No conversion from "+m.replace(" "," to ")),n!==!0&&(c=n?n(c):p(o(c)))}}return c}function ca(a,c,d){var e=a.contents,f=a.dataTypes,g=a.responseFields,h,i,j,k;for(i in g)i in d&&(c[g[i]]=d[i]);while(f[0]==="*")f.shift(),h===b&&(h=a.mimeType||c.getResponseHeader("content-type"));if(h)for(i in e)if(e[i]&&e[i].test(h)){f.unshift(i);break}if(f[0]in d)j=f[0];else{for(i in d){if(!f[0]||a.converters[i+" "+f[0]]){j=i;break}k||(k=i)}j=j||k}if(j){j!==f[0]&&f.unshift(j);return d[j]}}function b_(a,b,c,d){if(f.isArray(b))f.each(b,function(b,e){c||bD.test(a)?d(a,e):b_(a+"["+(typeof e=="object"?b:"")+"]",e,c,d)});else if(!c&&f.type(b)==="object")for(var e in b)b_(a+"["+e+"]",b[e],c,d);else d(a,b)}function b$(a,c){var d,e,g=f.ajaxSettings.flatOptions||{};for(d in c)c[d]!==b&&((g[d]?a:e||(e={}))[d]=c[d]);e&&f.extend(!0,a,e)}function bZ(a,c,d,e,f,g){f=f||c.dataTypes[0],g=g||{},g[f]=!0;var h=a[f],i=0,j=h?h.length:0,k=a===bS,l;for(;i<j&&(k||!l);i++)l=h[i](c,d,e),typeof l=="string"&&(!k||g[l]?l=b:(c.dataTypes.unshift(l),l=bZ(a,c,d,e,l,g)));(k||!l)&&!g["*"]&&(l=bZ(a,c,d,e,"*",g));return l}function bY(a){return function(b,c){typeof b!="string"&&(c=b,b="*");if(f.isFunction(c)){var d=b.toLowerCase().split(bO),e=0,g=d.length,h,i,j;for(;e<g;e++)h=d[e],j=/^\+/.test(h),j&&(h=h.substr(1)||"*"),i=a[h]=a[h]||[],i[j?"unshift":"push"](c)}}}function bB(a,b,c){var d=b==="width"?a.offsetWidth:a.offsetHeight,e=b==="width"?1:0,g=4;if(d>0){if(c!=="border")for(;e<g;e+=2)c||(d-=parseFloat(f.css(a,"padding"+bx[e]))||0),c==="margin"?d+=parseFloat(f.css(a,c+bx[e]))||0:d-=parseFloat(f.css(a,"border"+bx[e]+"Width"))||0;return d+"px"}d=by(a,b);if(d<0||d==null)d=a.style[b];if(bt.test(d))return d;d=parseFloat(d)||0;if(c)for(;e<g;e+=2)d+=parseFloat(f.css(a,"padding"+bx[e]))||0,c!=="padding"&&(d+=parseFloat(f.css(a,"border"+bx[e]+"Width"))||0),c==="margin"&&(d+=parseFloat(f.css(a,c+bx[e]))||0);return d+"px"}function bo(a){var b=c.createElement("div");bh.appendChild(b),b.innerHTML=a.outerHTML;return b.firstChild}function bn(a){var b=(a.nodeName||"").toLowerCase();b==="input"?bm(a):b!=="script"&&typeof a.getElementsByTagName!="undefined"&&f.grep(a.getElementsByTagName("input"),bm)}function bm(a){if(a.type==="checkbox"||a.type==="radio")a.defaultChecked=a.checked}function bl(a){return typeof a.getElementsByTagName!="undefined"?a.getElementsByTagName("*"):typeof a.querySelectorAll!="undefined"?a.querySelectorAll("*"):[]}function bk(a,b){var c;b.nodeType===1&&(b.clearAttributes&&b.clearAttributes(),b.mergeAttributes&&b.mergeAttributes(a),c=b.nodeName.toLowerCase(),c==="object"?b.outerHTML=a.outerHTML:c!=="input"||a.type!=="checkbox"&&a.type!=="radio"?c==="option"?b.selected=a.defaultSelected:c==="input"||c==="textarea"?b.defaultValue=a.defaultValue:c==="script"&&b.text!==a.text&&(b.text=a.text):(a.checked&&(b.defaultChecked=b.checked=a.checked),b.value!==a.value&&(b.value=a.value)),b.removeAttribute(f.expando),b.removeAttribute("_submit_attached"),b.removeAttribute("_change_attached"))}function bj(a,b){if(b.nodeType===1&&!!f.hasData(a)){var c,d,e,g=f._data(a),h=f._data(b,g),i=g.events;if(i){delete h.handle,h.events={};for(c in i)for(d=0,e=i[c].length;d<e;d++)f.event.add(b,c,i[c][d])}h.data&&(h.data=f.extend({},h.data))}}function bi(a,b){return f.nodeName(a,"table")?a.getElementsByTagName("tbody")[0]||a.appendChild(a.ownerDocument.createElement("tbody")):a}function U(a){var b=V.split("|"),c=a.createDocumentFragment();if(c.createElement)while(b.length)c.createElement(b.pop());return c}function T(a,b,c){b=b||0;if(f.isFunction(b))return f.grep(a,function(a,d){var e=!!b.call(a,d,a);return e===c});if(b.nodeType)return f.grep(a,function(a,d){return a===b===c});if(typeof b=="string"){var d=f.grep(a,function(a){return a.nodeType===1});if(O.test(b))return f.filter(b,d,!c);b=f.filter(b,d)}return f.grep(a,function(a,d){return f.inArray(a,b)>=0===c})}function S(a){return!a||!a.parentNode||a.parentNode.nodeType===11}function K(){return!0}function J(){return!1}function n(a,b,c){var d=b+"defer",e=b+"queue",g=b+"mark",h=f._data(a,d);h&&(c==="queue"||!f._data(a,e))&&(c==="mark"||!f._data(a,g))&&setTimeout(function(){!f._data(a,e)&&!f._data(a,g)&&(f.removeData(a,d,!0),h.fire())},0)}function m(a){for(var b in a){if(b==="data"&&f.isEmptyObject(a[b]))continue;if(b!=="toJSON")return!1}return!0}function l(a,c,d){if(d===b&&a.nodeType===1){var e="data-"+c.replace(k,"-$1").toLowerCase();d=a.getAttribute(e);if(typeof d=="string"){try{d=d==="true"?!0:d==="false"?!1:d==="null"?null:f.isNumeric(d)?+d:j.test(d)?f.parseJSON(d):d}catch(g){}f.data(a,c,d)}else d=b}return d}function h(a){var b=g[a]={},c,d;a=a.split(/\s+/);for(c=0,d=a.length;c<d;c++)b[a[c]]=!0;return b}var c=a.document,d=a.navigator,e=a.location,f=function(){function J(){if(!e.isReady){try{c.documentElement.doScroll("left")}catch(a){setTimeout(J,1);return}e.ready()}}var e=function(a,b){return new e.fn.init(a,b,h)},f=a.jQuery,g=a.$,h,i=/^(?:[^#<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/,j=/\S/,k=/^\s+/,l=/\s+$/,m=/^<(\w+)\s*\/?>(?:<\/\1>)?$/,n=/^[\],:{}\s]*$/,o=/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,p=/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,q=/(?:^|:|,)(?:\s*\[)+/g,r=/(webkit)[ \/]([\w.]+)/,s=/(opera)(?:.*version)?[ \/]([\w.]+)/,t=/(msie) ([\w.]+)/,u=/(mozilla)(?:.*? rv:([\w.]+))?/,v=/-([a-z]|[0-9])/ig,w=/^-ms-/,x=function(a,b){return(b+"").toUpperCase()},y=d.userAgent,z,A,B,C=Object.prototype.toString,D=Object.prototype.hasOwnProperty,E=Array.prototype.push,F=Array.prototype.slice,G=String.prototype.trim,H=Array.prototype.indexOf,I={};e.fn=e.prototype={constructor:e,init:function(a,d,f){var g,h,j,k;if(!a)return this;if(a.nodeType){this.context=this[0]=a,this.length=1;return this}if(a==="body"&&!d&&c.body){this.context=c,this[0]=c.body,this.selector=a,this.length=1;return this}if(typeof a=="string"){a.charAt(0)!=="<"||a.charAt(a.length-1)!==">"||a.length<3?g=i.exec(a):g=[null,a,null];if(g&&(g[1]||!d)){if(g[1]){d=d instanceof e?d[0]:d,k=d?d.ownerDocument||d:c,j=m.exec(a),j?e.isPlainObject(d)?(a=[c.createElement(j[1])],e.fn.attr.call(a,d,!0)):a=[k.createElement(j[1])]:(j=e.buildFragment([g[1]],[k]),a=(j.cacheable?e.clone(j.fragment):j.fragment).childNodes);return e.merge(this,a)}h=c.getElementById(g[2]);if(h&&h.parentNode){if(h.id!==g[2])return f.find(a);this.length=1,this[0]=h}this.context=c,this.selector=a;return this}return!d||d.jquery?(d||f).find(a):this.constructor(d).find(a)}if(e.isFunction(a))return f.ready(a);a.selector!==b&&(this.selector=a.selector,this.context=a.context);return e.makeArray(a,this)},selector:"",jquery:"1.7.2",length:0,size:function(){return this.length},toArray:function(){return F.call(this,0)},get:function(a){return a==null?this.toArray():a<0?this[this.length+a]:this[a]},pushStack:function(a,b,c){var d=this.constructor();e.isArray(a)?E.apply(d,a):e.merge(d,a),d.prevObject=this,d.context=this.context,b==="find"?d.selector=this.selector+(this.selector?" ":"")+c:b&&(d.selector=this.selector+"."+b+"("+c+")");return d},each:function(a,b){return e.each(this,a,b)},ready:function(a){e.bindReady(),A.add(a);return this},eq:function(a){a=+a;return a===-1?this.slice(a):this.slice(a,a+1)},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},slice:function(){return this.pushStack(F.apply(this,arguments),"slice",F.call(arguments).join(","))},map:function(a){return this.pushStack(e.map(this,function(b,c){return a.call(b,c,b)}))},end:function(){return this.prevObject||this.constructor(null)},push:E,sort:[].sort,splice:[].splice},e.fn.init.prototype=e.fn,e.extend=e.fn.extend=function(){var a,c,d,f,g,h,i=arguments[0]||{},j=1,k=arguments.length,l=!1;typeof i=="boolean"&&(l=i,i=arguments[1]||{},j=2),typeof i!="object"&&!e.isFunction(i)&&(i={}),k===j&&(i=this,--j);for(;j<k;j++)if((a=arguments[j])!=null)for(c in a){d=i[c],f=a[c];if(i===f)continue;l&&f&&(e.isPlainObject(f)||(g=e.isArray(f)))?(g?(g=!1,h=d&&e.isArray(d)?d:[]):h=d&&e.isPlainObject(d)?d:{},i[c]=e.extend(l,h,f)):f!==b&&(i[c]=f)}return i},e.extend({noConflict:function(b){a.$===e&&(a.$=g),b&&a.jQuery===e&&(a.jQuery=f);return e},isReady:!1,readyWait:1,holdReady:function(a){a?e.readyWait++:e.ready(!0)},ready:function(a){if(a===!0&&!--e.readyWait||a!==!0&&!e.isReady){if(!c.body)return setTimeout(e.ready,1);e.isReady=!0;if(a!==!0&&--e.readyWait>0)return;A.fireWith(c,[e]),e.fn.trigger&&e(c).trigger("ready").off("ready")}},bindReady:function(){if(!A){A=e.Callbacks("once memory");if(c.readyState==="complete")return setTimeout(e.ready,1);if(c.addEventListener)c.addEventListener("DOMContentLoaded",B,!1),a.addEventListener("load",e.ready,!1);else if(c.attachEvent){c.attachEvent("onreadystatechange",B),a.attachEvent("onload",e.ready);var b=!1;try{b=a.frameElement==null}catch(d){}c.documentElement.doScroll&&b&&J()}}},isFunction:function(a){return e.type(a)==="function"},isArray:Array.isArray||function(a){return e.type(a)==="array"},isWindow:function(a){return a!=null&&a==a.window},isNumeric:function(a){return!isNaN(parseFloat(a))&&isFinite(a)},type:function(a){return a==null?String(a):I[C.call(a)]||"object"},isPlainObject:function(a){if(!a||e.type(a)!=="object"||a.nodeType||e.isWindow(a))return!1;try{if(a.constructor&&!D.call(a,"constructor")&&!D.call(a.constructor.prototype,"isPrototypeOf"))return!1}catch(c){return!1}var d;for(d in a);return d===b||D.call(a,d)},isEmptyObject:function(a){for(var b in a)return!1;return!0},error:function(a){throw new Error(a)},parseJSON:function(b){if(typeof b!="string"||!b)return null;b=e.trim(b);if(a.JSON&&a.JSON.parse)return a.JSON.parse(b);if(n.test(b.replace(o,"@").replace(p,"]").replace(q,"")))return(new Function("return "+b))();e.error("Invalid JSON: "+b)},parseXML:function(c){if(typeof c!="string"||!c)return null;var d,f;try{a.DOMParser?(f=new DOMParser,d=f.parseFromString(c,"text/xml")):(d=new ActiveXObject("Microsoft.XMLDOM"),d.async="false",d.loadXML(c))}catch(g){d=b}(!d||!d.documentElement||d.getElementsByTagName("parsererror").length)&&e.error("Invalid XML: "+c);return d},noop:function(){},globalEval:function(b){b&&j.test(b)&&(a.execScript||function(b){a.eval.call(a,b)})(b)},camelCase:function(a){return a.replace(w,"ms-").replace(v,x)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toUpperCase()===b.toUpperCase()},each:function(a,c,d){var f,g=0,h=a.length,i=h===b||e.isFunction(a);if(d){if(i){for(f in a)if(c.apply(a[f],d)===!1)break}else for(;g<h;)if(c.apply(a[g++],d)===!1)break}else if(i){for(f in a)if(c.call(a[f],f,a[f])===!1)break}else for(;g<h;)if(c.call(a[g],g,a[g++])===!1)break;return a},trim:G?function(a){return a==null?"":G.call(a)}:function(a){return a==null?"":(a+"").replace(k,"").replace(l,"")},makeArray:function(a,b){var c=b||[];if(a!=null){var d=e.type(a);a.length==null||d==="string"||d==="function"||d==="regexp"||e.isWindow(a)?E.call(c,a):e.merge(c,a)}return c},inArray:function(a,b,c){var d;if(b){if(H)return H.call(b,a,c);d=b.length,c=c?c<0?Math.max(0,d+c):c:0;for(;c<d;c++)if(c in b&&b[c]===a)return c}return-1},merge:function(a,c){var d=a.length,e=0;if(typeof c.length=="number")for(var f=c.length;e<f;e++)a[d++]=c[e];else while(c[e]!==b)a[d++]=c[e++];a.length=d;return a},grep:function(a,b,c){var d=[],e;c=!!c;for(var f=0,g=a.length;f<g;f++)e=!!b(a[f],f),c!==e&&d.push(a[f]);return d},map:function(a,c,d){var f,g,h=[],i=0,j=a.length,k=a instanceof e||j!==b&&typeof j=="number"&&(j>0&&a[0]&&a[j-1]||j===0||e.isArray(a));if(k)for(;i<j;i++)f=c(a[i],i,d),f!=null&&(h[h.length]=f);else for(g in a)f=c(a[g],g,d),f!=null&&(h[h.length]=f);return h.concat.apply([],h)},guid:1,proxy:function(a,c){if(typeof c=="string"){var d=a[c];c=a,a=d}if(!e.isFunction(a))return b;var f=F.call(arguments,2),g=function(){return a.apply(c,f.concat(F.call(arguments)))};g.guid=a.guid=a.guid||g.guid||e.guid++;return g},access:function(a,c,d,f,g,h,i){var j,k=d==null,l=0,m=a.length;if(d&&typeof d=="object"){for(l in d)e.access(a,c,l,d[l],1,h,f);g=1}else if(f!==b){j=i===b&&e.isFunction(f),k&&(j?(j=c,c=function(a,b,c){return j.call(e(a),c)}):(c.call(a,f),c=null));if(c)for(;l<m;l++)c(a[l],d,j?f.call(a[l],l,c(a[l],d)):f,i);g=1}return g?a:k?c.call(a):m?c(a[0],d):h},now:function(){return(new Date).getTime()},uaMatch:function(a){a=a.toLowerCase();var b=r.exec(a)||s.exec(a)||t.exec(a)||a.indexOf("compatible")<0&&u.exec(a)||[];return{browser:b[1]||"",version:b[2]||"0"}},sub:function(){function a(b,c){return new a.fn.init(b,c)}e.extend(!0,a,this),a.superclass=this,a.fn=a.prototype=this(),a.fn.constructor=a,a.sub=this.sub,a.fn.init=function(d,f){f&&f instanceof e&&!(f instanceof a)&&(f=a(f));return e.fn.init.call(this,d,f,b)},a.fn.init.prototype=a.fn;var b=a(c);return a},browser:{}}),e.each("Boolean Number String Function Array Date RegExp Object".split(" "),function(a,b){I["[object "+b+"]"]=b.toLowerCase()}),z=e.uaMatch(y),z.browser&&(e.browser[z.browser]=!0,e.browser.version=z.version),e.browser.webkit&&(e.browser.safari=!0),j.test(" ")&&(k=/^[\s\xA0]+/,l=/[\s\xA0]+$/),h=e(c),c.addEventListener?B=function(){c.removeEventListener("DOMContentLoaded",B,!1),e.ready()}:c.attachEvent&&(B=function(){c.readyState==="complete"&&(c.detachEvent("onreadystatechange",B),e.ready())});return e}(),g={};f.Callbacks=function(a){a=a?g[a]||h(a):{};var c=[],d=[],e,i,j,k,l,m,n=function(b){var d,e,g,h,i;for(d=0,e=b.length;d<e;d++)g=b[d],h=f.type(g),h==="array"?n(g):h==="function"&&(!a.unique||!p.has(g))&&c.push(g)},o=function(b,f){f=f||[],e=!a.memory||[b,f],i=!0,j=!0,m=k||0,k=0,l=c.length;for(;c&&m<l;m++)if(c[m].apply(b,f)===!1&&a.stopOnFalse){e=!0;break}j=!1,c&&(a.once?e===!0?p.disable():c=[]:d&&d.length&&(e=d.shift(),p.fireWith(e[0],e[1])))},p={add:function(){if(c){var a=c.length;n(arguments),j?l=c.length:e&&e!==!0&&(k=a,o(e[0],e[1]))}return this},remove:function(){if(c){var b=arguments,d=0,e=b.length;for(;d<e;d++)for(var f=0;f<c.length;f++)if(b[d]===c[f]){j&&f<=l&&(l--,f<=m&&m--),c.splice(f--,1);if(a.unique)break}}return this},has:function(a){if(c){var b=0,d=c.length;for(;b<d;b++)if(a===c[b])return!0}return!1},empty:function(){c=[];return this},disable:function(){c=d=e=b;return this},disabled:function(){return!c},lock:function(){d=b,(!e||e===!0)&&p.disable();return this},locked:function(){return!d},fireWith:function(b,c){d&&(j?a.once||d.push([b,c]):(!a.once||!e)&&o(b,c));return this},fire:function(){p.fireWith(this,arguments);return this},fired:function(){return!!i}};return p};var i=[].slice;f.extend({Deferred:function(a){var b=f.Callbacks("once memory"),c=f.Callbacks("once memory"),d=f.Callbacks("memory"),e="pending",g={resolve:b,reject:c,notify:d},h={done:b.add,fail:c.add,progress:d.add,state:function(){return e},isResolved:b.fired,isRejected:c.fired,then:function(a,b,c){i.done(a).fail(b).progress(c);return this},always:function(){i.done.apply(i,arguments).fail.apply(i,arguments);return this},pipe:function(a,b,c){return f.Deferred(function(d){f.each({done:[a,"resolve"],fail:[b,"reject"],progress:[c,"notify"]},function(a,b){var c=b[0],e=b[1],g;f.isFunction(c)?i[a](function(){g=c.apply(this,arguments),g&&f.isFunction(g.promise)?g.promise().then(d.resolve,d.reject,d.notify):d[e+"With"](this===i?d:this,[g])}):i[a](d[e])})}).promise()},promise:function(a){if(a==null)a=h;else for(var b in h)a[b]=h[b];return a}},i=h.promise({}),j;for(j in g)i[j]=g[j].fire,i[j+"With"]=g[j].fireWith;i.done(function(){e="resolved"},c.disable,d.lock).fail(function(){e="rejected"},b.disable,d.lock),a&&a.call(i,i);return i},when:function(a){function m(a){return function(b){e[a]=arguments.length>1?i.call(arguments,0):b,j.notifyWith(k,e)}}function l(a){return function(c){b[a]=arguments.length>1?i.call(arguments,0):c,--g||j.resolveWith(j,b)}}var b=i.call(arguments,0),c=0,d=b.length,e=Array(d),g=d,h=d,j=d<=1&&a&&f.isFunction(a.promise)?a:f.Deferred(),k=j.promise();if(d>1){for(;c<d;c++)b[c]&&b[c].promise&&f.isFunction(b[c].promise)?b[c].promise().then(l(c),j.reject,m(c)):--g;g||j.resolveWith(j,b)}else j!==a&&j.resolveWith(j,d?[a]:[]);return k}}),f.support=function(){var b,d,e,g,h,i,j,k,l,m,n,o,p=c.createElement("div"),q=c.documentElement;p.setAttribute("className","t"),p.innerHTML="   <link/><table></table><a href='/a' style='top:1px;float:left;opacity:.55;'>a</a><input type='checkbox'/>",d=p.getElementsByTagName("*"),e=p.getElementsByTagName("a")[0];if(!d||!d.length||!e)return{};g=c.createElement("select"),h=g.appendChild(c.createElement("option")),i=p.getElementsByTagName("input")[0],b={leadingWhitespace:p.firstChild.nodeType===3,tbody:!p.getElementsByTagName("tbody").length,htmlSerialize:!!p.getElementsByTagName("link").length,style:/top/.test(e.getAttribute("style")),hrefNormalized:e.getAttribute("href")==="/a",opacity:/^0.55/.test(e.style.opacity),cssFloat:!!e.style.cssFloat,checkOn:i.value==="on",optSelected:h.selected,getSetAttribute:p.className!=="t",enctype:!!c.createElement("form").enctype,html5Clone:c.createElement("nav").cloneNode(!0).outerHTML!=="<:nav></:nav>",submitBubbles:!0,changeBubbles:!0,focusinBubbles:!1,deleteExpando:!0,noCloneEvent:!0,inlineBlockNeedsLayout:!1,shrinkWrapBlocks:!1,reliableMarginRight:!0,pixelMargin:!0},f.boxModel=b.boxModel=c.compatMode==="CSS1Compat",i.checked=!0,b.noCloneChecked=i.cloneNode(!0).checked,g.disabled=!0,b.optDisabled=!h.disabled;try{delete p.test}catch(r){b.deleteExpando=!1}!p.addEventListener&&p.attachEvent&&p.fireEvent&&(p.attachEvent("onclick",function(){b.noCloneEvent=!1}),p.cloneNode(!0).fireEvent("onclick")),i=c.createElement("input"),i.value="t",i.setAttribute("type","radio"),b.radioValue=i.value==="t",i.setAttribute("checked","checked"),i.setAttribute("name","t"),p.appendChild(i),j=c.createDocumentFragment(),j.appendChild(p.lastChild),b.checkClone=j.cloneNode(!0).cloneNode(!0).lastChild.checked,b.appendChecked=i.checked,j.removeChild(i),j.appendChild(p);if(p.attachEvent)for(n in{submit:1,change:1,focusin:1})m="on"+n,o=m in p,o||(p.setAttribute(m,"return;"),o=typeof p[m]=="function"),b[n+"Bubbles"]=o;j.removeChild(p),j=g=h=p=i=null,f(function(){var d,e,g,h,i,j,l,m,n,q,r,s,t,u=c.getElementsByTagName("body")[0];!u||(m=1,t="padding:0;margin:0;border:",r="position:absolute;top:0;left:0;width:1px;height:1px;",s=t+"0;visibility:hidden;",n="style='"+r+t+"5px solid #000;",q="<div "+n+"display:block;'><div style='"+t+"0;display:block;overflow:hidden;'></div></div>"+"<table "+n+"' cellpadding='0' cellspacing='0'>"+"<tr><td></td></tr></table>",d=c.createElement("div"),d.style.cssText=s+"width:0;height:0;position:static;top:0;margin-top:"+m+"px",u.insertBefore(d,u.firstChild),p=c.createElement("div"),d.appendChild(p),p.innerHTML="<table><tr><td style='"+t+"0;display:none'></td><td>t</td></tr></table>",k=p.getElementsByTagName("td"),o=k[0].offsetHeight===0,k[0].style.display="",k[1].style.display="none",b.reliableHiddenOffsets=o&&k[0].offsetHeight===0,a.getComputedStyle&&(p.innerHTML="",l=c.createElement("div"),l.style.width="0",l.style.marginRight="0",p.style.width="2px",p.appendChild(l),b.reliableMarginRight=(parseInt((a.getComputedStyle(l,null)||{marginRight:0}).marginRight,10)||0)===0),typeof p.style.zoom!="undefined"&&(p.innerHTML="",p.style.width=p.style.padding="1px",p.style.border=0,p.style.overflow="hidden",p.style.display="inline",p.style.zoom=1,b.inlineBlockNeedsLayout=p.offsetWidth===3,p.style.display="block",p.style.overflow="visible",p.innerHTML="<div style='width:5px;'></div>",b.shrinkWrapBlocks=p.offsetWidth!==3),p.style.cssText=r+s,p.innerHTML=q,e=p.firstChild,g=e.firstChild,i=e.nextSibling.firstChild.firstChild,j={doesNotAddBorder:g.offsetTop!==5,doesAddBorderForTableAndCells:i.offsetTop===5},g.style.position="fixed",g.style.top="20px",j.fixedPosition=g.offsetTop===20||g.offsetTop===15,g.style.position=g.style.top="",e.style.overflow="hidden",e.style.position="relative",j.subtractsBorderForOverflowNotVisible=g.offsetTop===-5,j.doesNotIncludeMarginInBodyOffset=u.offsetTop!==m,a.getComputedStyle&&(p.style.marginTop="1%",b.pixelMargin=(a.getComputedStyle(p,null)||{marginTop:0}).marginTop!=="1%"),typeof d.style.zoom!="undefined"&&(d.style.zoom=1),u.removeChild(d),l=p=d=null,f.extend(b,j))});return b}();var j=/^(?:\{.*\}|\[.*\])$/,k=/([A-Z])/g;f.extend({cache:{},uuid:0,expando:"jQuery"+(f.fn.jquery+Math.random()).replace(/\D/g,""),noData:{embed:!0,object:"clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",applet:!0},hasData:function(a){a=a.nodeType?f.cache[a[f.expando]]:a[f.expando];return!!a&&!m(a)},data:function(a,c,d,e){if(!!f.acceptData(a)){var g,h,i,j=f.expando,k=typeof c=="string",l=a.nodeType,m=l?f.cache:a,n=l?a[j]:a[j]&&j,o=c==="events";if((!n||!m[n]||!o&&!e&&!m[n].data)&&k&&d===b)return;n||(l?a[j]=n=++f.uuid:n=j),m[n]||(m[n]={},l||(m[n].toJSON=f.noop));if(typeof c=="object"||typeof c=="function")e?m[n]=f.extend(m[n],c):m[n].data=f.extend(m[n].data,c);g=h=m[n],e||(h.data||(h.data={}),h=h.data),d!==b&&(h[f.camelCase(c)]=d);if(o&&!h[c])return g.events;k?(i=h[c],i==null&&(i=h[f.camelCase(c)])):i=h;return i}},removeData:function(a,b,c){if(!!f.acceptData(a)){var d,e,g,h=f.expando,i=a.nodeType,j=i?f.cache:a,k=i?a[h]:h;if(!j[k])return;if(b){d=c?j[k]:j[k].data;if(d){f.isArray(b)||(b in d?b=[b]:(b=f.camelCase(b),b in d?b=[b]:b=b.split(" ")));for(e=0,g=b.length;e<g;e++)delete d[b[e]];if(!(c?m:f.isEmptyObject)(d))return}}if(!c){delete j[k].data;if(!m(j[k]))return}f.support.deleteExpando||!j.setInterval?delete j[k]:j[k]=null,i&&(f.support.deleteExpando?delete a[h]:a.removeAttribute?a.removeAttribute(h):a[h]=null)}},_data:function(a,b,c){return f.data(a,b,c,!0)},acceptData:function(a){if(a.nodeName){var b=f.noData[a.nodeName.toLowerCase()];if(b)return b!==!0&&a.getAttribute("classid")===b}return!0}}),f.fn.extend({data:function(a,c){var d,e,g,h,i,j=this[0],k=0,m=null;if(a===b){if(this.length){m=f.data(j);if(j.nodeType===1&&!f._data(j,"parsedAttrs")){g=j.attributes;for(i=g.length;k<i;k++)h=g[k].name,h.indexOf("data-")===0&&(h=f.camelCase(h.substring(5)),l(j,h,m[h]));f._data(j,"parsedAttrs",!0)}}return m}if(typeof a=="object")return this.each(function(){f.data(this,a)});d=a.split(".",2),d[1]=d[1]?"."+d[1]:"",e=d[1]+"!";return f.access(this,function(c){if(c===b){m=this.triggerHandler("getData"+e,[d[0]]),m===b&&j&&(m=f.data(j,a),m=l(j,a,m));return m===b&&d[1]?this.data(d[0]):m}d[1]=c,this.each(function(){var b=f(this);b.triggerHandler("setData"+e,d),f.data(this,a,c),b.triggerHandler("changeData"+e,d)})},null,c,arguments.length>1,null,!1)},removeData:function(a){return this.each(function(){f.removeData(this,a)})}}),f.extend({_mark:function(a,b){a&&(b=(b||"fx")+"mark",f._data(a,b,(f._data(a,b)||0)+1))},_unmark:function(a,b,c){a!==!0&&(c=b,b=a,a=!1);if(b){c=c||"fx";var d=c+"mark",e=a?0:(f._data(b,d)||1)-1;e?f._data(b,d,e):(f.removeData(b,d,!0),n(b,c,"mark"))}},queue:function(a,b,c){var d;if(a){b=(b||"fx")+"queue",d=f._data(a,b),c&&(!d||f.isArray(c)?d=f._data(a,b,f.makeArray(c)):d.push(c));return d||[]}},dequeue:function(a,b){b=b||"fx";var c=f.queue(a,b),d=c.shift(),e={};d==="inprogress"&&(d=c.shift()),d&&(b==="fx"&&c.unshift("inprogress"),f._data(a,b+".run",e),d.call(a,function(){f.dequeue(a,b)},e)),c.length||(f.removeData(a,b+"queue "+b+".run",!0),n(a,b,"queue"))}}),f.fn.extend({queue:function(a,c){var d=2;typeof a!="string"&&(c=a,a="fx",d--);if(arguments.length<d)return f.queue(this[0],a);return c===b?this:this.each(function(){var b=f.queue(this,a,c);a==="fx"&&b[0]!=="inprogress"&&f.dequeue(this,a)})},dequeue:function(a){return this.each(function(){f.dequeue(this,a)})},delay:function(a,b){a=f.fx?f.fx.speeds[a]||a:a,b=b||"fx";return this.queue(b,function(b,c){var d=setTimeout(b,a);c.stop=function(){clearTimeout(d)}})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,c){function m(){--h||d.resolveWith(e,[e])}typeof a!="string"&&(c=a,a=b),a=a||"fx";var d=f.Deferred(),e=this,g=e.length,h=1,i=a+"defer",j=a+"queue",k=a+"mark",l;while(g--)if(l=f.data(e[g],i,b,!0)||(f.data(e[g],j,b,!0)||f.data(e[g],k,b,!0))&&f.data(e[g],i,f.Callbacks("once memory"),!0))h++,l.add(m);m();return d.promise(c)}});var o=/[\n\t\r]/g,p=/\s+/,q=/\r/g,r=/^(?:button|input)$/i,s=/^(?:button|input|object|select|textarea)$/i,t=/^a(?:rea)?$/i,u=/^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i,v=f.support.getSetAttribute,w,x,y;f.fn.extend({attr:function(a,b){return f.access(this,f.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){f.removeAttr(this,a)})},prop:function(a,b){return f.access(this,f.prop,a,b,arguments.length>1)},removeProp:function(a){a=f.propFix[a]||a;return this.each(function(){try{this[a]=b,delete this[a]}catch(c){}})},addClass:function(a){var b,c,d,e,g,h,i;if(f.isFunction(a))return this.each(function(b){f(this).addClass(a.call(this,b,this.className))});if(a&&typeof a=="string"){b=a.split(p);for(c=0,d=this.length;c<d;c++){e=this[c];if(e.nodeType===1)if(!e.className&&b.length===1)e.className=a;else{g=" "+e.className+" ";for(h=0,i=b.length;h<i;h++)~g.indexOf(" "+b[h]+" ")||(g+=b[h]+" ");e.className=f.trim(g)}}}return this},removeClass:function(a){var c,d,e,g,h,i,j;if(f.isFunction(a))return this.each(function(b){f(this).removeClass(a.call(this,b,this.className))});if(a&&typeof a=="string"||a===b){c=(a||"").split(p);for(d=0,e=this.length;d<e;d++){g=this[d];if(g.nodeType===1&&g.className)if(a){h=(" "+g.className+" ").replace(o," ");for(i=0,j=c.length;i<j;i++)h=h.replace(" "+c[i]+" "," ");g.className=f.trim(h)}else g.className=""}}return this},toggleClass:function(a,b){var c=typeof a,d=typeof b=="boolean";if(f.isFunction(a))return this.each(function(c){f(this).toggleClass(a.call(this,c,this.className,b),b)});return this.each(function(){if(c==="string"){var e,g=0,h=f(this),i=b,j=a.split(p);while(e=j[g++])i=d?i:!h.hasClass(e),h[i?"addClass":"removeClass"](e)}else if(c==="undefined"||c==="boolean")this.className&&f._data(this,"__className__",this.className),this.className=this.className||a===!1?"":f._data(this,"__className__")||""})},hasClass:function(a){var b=" "+a+" ",c=0,d=this.length;for(;c<d;c++)if(this[c].nodeType===1&&(" "+this[c].className+" ").replace(o," ").indexOf(b)>-1)return!0;return!1},val:function(a){var c,d,e,g=this[0];{if(!!arguments.length){e=f.isFunction(a);return this.each(function(d){var g=f(this),h;if(this.nodeType===1){e?h=a.call(this,d,g.val()):h=a,h==null?h="":typeof h=="number"?h+="":f.isArray(h)&&(h=f.map(h,function(a){return a==null?"":a+""})),c=f.valHooks[this.type]||f.valHooks[this.nodeName.toLowerCase()];if(!c||!("set"in c)||c.set(this,h,"value")===b)this.value=h}})}if(g){c=f.valHooks[g.type]||f.valHooks[g.nodeName.toLowerCase()];if(c&&"get"in c&&(d=c.get(g,"value"))!==b)return d;d=g.value;return typeof d=="string"?d.replace(q,""):d==null?"":d}}}}),f.extend({valHooks:{option:{get:function(a){var b=a.attributes.value;return!b||b.specified?a.value:a.text}},select:{get:function(a){var b,c,d,e,g=a.selectedIndex,h=[],i=a.options,j=a.type==="select-one";if(g<0)return null;c=j?g:0,d=j?g+1:i.length;for(;c<d;c++){e=i[c];if(e.selected&&(f.support.optDisabled?!e.disabled:e.getAttribute("disabled")===null)&&(!e.parentNode.disabled||!f.nodeName(e.parentNode,"optgroup"))){b=f(e).val();if(j)return b;h.push(b)}}if(j&&!h.length&&i.length)return f(i[g]).val();return h},set:function(a,b){var c=f.makeArray(b);f(a).find("option").each(function(){this.selected=f.inArray(f(this).val(),c)>=0}),c.length||(a.selectedIndex=-1);return c}}},attrFn:{val:!0,css:!0,html:!0,text:!0,data:!0,width:!0,height:!0,offset:!0},attr:function(a,c,d,e){var g,h,i,j=a.nodeType;if(!!a&&j!==3&&j!==8&&j!==2){if(e&&c in f.attrFn)return f(a)[c](d);if(typeof a.getAttribute=="undefined")return f.prop(a,c,d);i=j!==1||!f.isXMLDoc(a),i&&(c=c.toLowerCase(),h=f.attrHooks[c]||(u.test(c)?x:w));if(d!==b){if(d===null){f.removeAttr(a,c);return}if(h&&"set"in h&&i&&(g=h.set(a,d,c))!==b)return g;a.setAttribute(c,""+d);return d}if(h&&"get"in h&&i&&(g=h.get(a,c))!==null)return g;g=a.getAttribute(c);return g===null?b:g}},removeAttr:function(a,b){var c,d,e,g,h,i=0;if(b&&a.nodeType===1){d=b.toLowerCase().split(p),g=d.length;for(;i<g;i++)e=d[i],e&&(c=f.propFix[e]||e,h=u.test(e),h||f.attr(a,e,""),a.removeAttribute(v?e:c),h&&c in a&&(a[c]=!1))}},attrHooks:{type:{set:function(a,b){if(r.test(a.nodeName)&&a.parentNode)f.error("type property can't be changed");else if(!f.support.radioValue&&b==="radio"&&f.nodeName(a,"input")){var c=a.value;a.setAttribute("type",b),c&&(a.value=c);return b}}},value:{get:function(a,b){if(w&&f.nodeName(a,"button"))return w.get(a,b);return b in a?a.value:null},set:function(a,b,c){if(w&&f.nodeName(a,"button"))return w.set(a,b,c);a.value=b}}},propFix:{tabindex:"tabIndex",readonly:"readOnly","for":"htmlFor","class":"className",maxlength:"maxLength",cellspacing:"cellSpacing",cellpadding:"cellPadding",rowspan:"rowSpan",colspan:"colSpan",usemap:"useMap",frameborder:"frameBorder",contenteditable:"contentEditable"},prop:function(a,c,d){var e,g,h,i=a.nodeType;if(!!a&&i!==3&&i!==8&&i!==2){h=i!==1||!f.isXMLDoc(a),h&&(c=f.propFix[c]||c,g=f.propHooks[c]);return d!==b?g&&"set"in g&&(e=g.set(a,d,c))!==b?e:a[c]=d:g&&"get"in g&&(e=g.get(a,c))!==null?e:a[c]}},propHooks:{tabIndex:{get:function(a){var c=a.getAttributeNode("tabindex");return c&&c.specified?parseInt(c.value,10):s.test(a.nodeName)||t.test(a.nodeName)&&a.href?0:b}}}}),f.attrHooks.tabindex=f.propHooks.tabIndex,x={get:function(a,c){var d,e=f.prop(a,c);return e===!0||typeof e!="boolean"&&(d=a.getAttributeNode(c))&&d.nodeValue!==!1?c.toLowerCase():b},set:function(a,b,c){var d;b===!1?f.removeAttr(a,c):(d=f.propFix[c]||c,d in a&&(a[d]=!0),a.setAttribute(c,c.toLowerCase()));return c}},v||(y={name:!0,id:!0,coords:!0},w=f.valHooks.button={get:function(a,c){var d;d=a.getAttributeNode(c);return d&&(y[c]?d.nodeValue!=="":d.specified)?d.nodeValue:b},set:function(a,b,d){var e=a.getAttributeNode(d);e||(e=c.createAttribute(d),a.setAttributeNode(e));return e.nodeValue=b+""}},f.attrHooks.tabindex.set=w.set,f.each(["width","height"],function(a,b){f.attrHooks[b]=f.extend(f.attrHooks[b],{set:function(a,c){if(c===""){a.setAttribute(b,"auto");return c}}})}),f.attrHooks.contenteditable={get:w.get,set:function(a,b,c){b===""&&(b="false"),w.set(a,b,c)}}),f.support.hrefNormalized||f.each(["href","src","width","height"],function(a,c){f.attrHooks[c]=f.extend(f.attrHooks[c],{get:function(a){var d=a.getAttribute(c,2);return d===null?b:d}})}),f.support.style||(f.attrHooks.style={get:function(a){return a.style.cssText.toLowerCase()||b},set:function(a,b){return a.style.cssText=""+b}}),f.support.optSelected||(f.propHooks.selected=f.extend(f.propHooks.selected,{get:function(a){var b=a.parentNode;b&&(b.selectedIndex,b.parentNode&&b.parentNode.selectedIndex);return null}})),f.support.enctype||(f.propFix.enctype="encoding"),f.support.checkOn||f.each(["radio","checkbox"],function(){f.valHooks[this]={get:function(a){return a.getAttribute("value")===null?"on":a.value}}}),f.each(["radio","checkbox"],function(){f.valHooks[this]=f.extend(f.valHooks[this],{set:function(a,b){if(f.isArray(b))return a.checked=f.inArray(f(a).val(),b)>=0}})});var z=/^(?:textarea|input|select)$/i,A=/^([^\.]*)?(?:\.(.+))?$/,B=/(?:^|\s)hover(\.\S+)?\b/,C=/^key/,D=/^(?:mouse|contextmenu)|click/,E=/^(?:focusinfocus|focusoutblur)$/,F=/^(\w*)(?:#([\w\-]+))?(?:\.([\w\-]+))?$/,G=function(
a){var b=F.exec(a);b&&(b[1]=(b[1]||"").toLowerCase(),b[3]=b[3]&&new RegExp("(?:^|\\s)"+b[3]+"(?:\\s|$)"));return b},H=function(a,b){var c=a.attributes||{};return(!b[1]||a.nodeName.toLowerCase()===b[1])&&(!b[2]||(c.id||{}).value===b[2])&&(!b[3]||b[3].test((c["class"]||{}).value))},I=function(a){return f.event.special.hover?a:a.replace(B,"mouseenter$1 mouseleave$1")};f.event={add:function(a,c,d,e,g){var h,i,j,k,l,m,n,o,p,q,r,s;if(!(a.nodeType===3||a.nodeType===8||!c||!d||!(h=f._data(a)))){d.handler&&(p=d,d=p.handler,g=p.selector),d.guid||(d.guid=f.guid++),j=h.events,j||(h.events=j={}),i=h.handle,i||(h.handle=i=function(a){return typeof f!="undefined"&&(!a||f.event.triggered!==a.type)?f.event.dispatch.apply(i.elem,arguments):b},i.elem=a),c=f.trim(I(c)).split(" ");for(k=0;k<c.length;k++){l=A.exec(c[k])||[],m=l[1],n=(l[2]||"").split(".").sort(),s=f.event.special[m]||{},m=(g?s.delegateType:s.bindType)||m,s=f.event.special[m]||{},o=f.extend({type:m,origType:l[1],data:e,handler:d,guid:d.guid,selector:g,quick:g&&G(g),namespace:n.join(".")},p),r=j[m];if(!r){r=j[m]=[],r.delegateCount=0;if(!s.setup||s.setup.call(a,e,n,i)===!1)a.addEventListener?a.addEventListener(m,i,!1):a.attachEvent&&a.attachEvent("on"+m,i)}s.add&&(s.add.call(a,o),o.handler.guid||(o.handler.guid=d.guid)),g?r.splice(r.delegateCount++,0,o):r.push(o),f.event.global[m]=!0}a=null}},global:{},remove:function(a,b,c,d,e){var g=f.hasData(a)&&f._data(a),h,i,j,k,l,m,n,o,p,q,r,s;if(!!g&&!!(o=g.events)){b=f.trim(I(b||"")).split(" ");for(h=0;h<b.length;h++){i=A.exec(b[h])||[],j=k=i[1],l=i[2];if(!j){for(j in o)f.event.remove(a,j+b[h],c,d,!0);continue}p=f.event.special[j]||{},j=(d?p.delegateType:p.bindType)||j,r=o[j]||[],m=r.length,l=l?new RegExp("(^|\\.)"+l.split(".").sort().join("\\.(?:.*\\.)?")+"(\\.|$)"):null;for(n=0;n<r.length;n++)s=r[n],(e||k===s.origType)&&(!c||c.guid===s.guid)&&(!l||l.test(s.namespace))&&(!d||d===s.selector||d==="**"&&s.selector)&&(r.splice(n--,1),s.selector&&r.delegateCount--,p.remove&&p.remove.call(a,s));r.length===0&&m!==r.length&&((!p.teardown||p.teardown.call(a,l)===!1)&&f.removeEvent(a,j,g.handle),delete o[j])}f.isEmptyObject(o)&&(q=g.handle,q&&(q.elem=null),f.removeData(a,["events","handle"],!0))}},customEvent:{getData:!0,setData:!0,changeData:!0},trigger:function(c,d,e,g){if(!e||e.nodeType!==3&&e.nodeType!==8){var h=c.type||c,i=[],j,k,l,m,n,o,p,q,r,s;if(E.test(h+f.event.triggered))return;h.indexOf("!")>=0&&(h=h.slice(0,-1),k=!0),h.indexOf(".")>=0&&(i=h.split("."),h=i.shift(),i.sort());if((!e||f.event.customEvent[h])&&!f.event.global[h])return;c=typeof c=="object"?c[f.expando]?c:new f.Event(h,c):new f.Event(h),c.type=h,c.isTrigger=!0,c.exclusive=k,c.namespace=i.join("."),c.namespace_re=c.namespace?new RegExp("(^|\\.)"+i.join("\\.(?:.*\\.)?")+"(\\.|$)"):null,o=h.indexOf(":")<0?"on"+h:"";if(!e){j=f.cache;for(l in j)j[l].events&&j[l].events[h]&&f.event.trigger(c,d,j[l].handle.elem,!0);return}c.result=b,c.target||(c.target=e),d=d!=null?f.makeArray(d):[],d.unshift(c),p=f.event.special[h]||{};if(p.trigger&&p.trigger.apply(e,d)===!1)return;r=[[e,p.bindType||h]];if(!g&&!p.noBubble&&!f.isWindow(e)){s=p.delegateType||h,m=E.test(s+h)?e:e.parentNode,n=null;for(;m;m=m.parentNode)r.push([m,s]),n=m;n&&n===e.ownerDocument&&r.push([n.defaultView||n.parentWindow||a,s])}for(l=0;l<r.length&&!c.isPropagationStopped();l++)m=r[l][0],c.type=r[l][1],q=(f._data(m,"events")||{})[c.type]&&f._data(m,"handle"),q&&q.apply(m,d),q=o&&m[o],q&&f.acceptData(m)&&q.apply(m,d)===!1&&c.preventDefault();c.type=h,!g&&!c.isDefaultPrevented()&&(!p._default||p._default.apply(e.ownerDocument,d)===!1)&&(h!=="click"||!f.nodeName(e,"a"))&&f.acceptData(e)&&o&&e[h]&&(h!=="focus"&&h!=="blur"||c.target.offsetWidth!==0)&&!f.isWindow(e)&&(n=e[o],n&&(e[o]=null),f.event.triggered=h,e[h](),f.event.triggered=b,n&&(e[o]=n));return c.result}},dispatch:function(c){c=f.event.fix(c||a.event);var d=(f._data(this,"events")||{})[c.type]||[],e=d.delegateCount,g=[].slice.call(arguments,0),h=!c.exclusive&&!c.namespace,i=f.event.special[c.type]||{},j=[],k,l,m,n,o,p,q,r,s,t,u;g[0]=c,c.delegateTarget=this;if(!i.preDispatch||i.preDispatch.call(this,c)!==!1){if(e&&(!c.button||c.type!=="click")){n=f(this),n.context=this.ownerDocument||this;for(m=c.target;m!=this;m=m.parentNode||this)if(m.disabled!==!0){p={},r=[],n[0]=m;for(k=0;k<e;k++)s=d[k],t=s.selector,p[t]===b&&(p[t]=s.quick?H(m,s.quick):n.is(t)),p[t]&&r.push(s);r.length&&j.push({elem:m,matches:r})}}d.length>e&&j.push({elem:this,matches:d.slice(e)});for(k=0;k<j.length&&!c.isPropagationStopped();k++){q=j[k],c.currentTarget=q.elem;for(l=0;l<q.matches.length&&!c.isImmediatePropagationStopped();l++){s=q.matches[l];if(h||!c.namespace&&!s.namespace||c.namespace_re&&c.namespace_re.test(s.namespace))c.data=s.data,c.handleObj=s,o=((f.event.special[s.origType]||{}).handle||s.handler).apply(q.elem,g),o!==b&&(c.result=o,o===!1&&(c.preventDefault(),c.stopPropagation()))}}i.postDispatch&&i.postDispatch.call(this,c);return c.result}},props:"attrChange attrName relatedNode srcElement altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){a.which==null&&(a.which=b.charCode!=null?b.charCode:b.keyCode);return a}},mouseHooks:{props:"button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,d){var e,f,g,h=d.button,i=d.fromElement;a.pageX==null&&d.clientX!=null&&(e=a.target.ownerDocument||c,f=e.documentElement,g=e.body,a.pageX=d.clientX+(f&&f.scrollLeft||g&&g.scrollLeft||0)-(f&&f.clientLeft||g&&g.clientLeft||0),a.pageY=d.clientY+(f&&f.scrollTop||g&&g.scrollTop||0)-(f&&f.clientTop||g&&g.clientTop||0)),!a.relatedTarget&&i&&(a.relatedTarget=i===a.target?d.toElement:i),!a.which&&h!==b&&(a.which=h&1?1:h&2?3:h&4?2:0);return a}},fix:function(a){if(a[f.expando])return a;var d,e,g=a,h=f.event.fixHooks[a.type]||{},i=h.props?this.props.concat(h.props):this.props;a=f.Event(g);for(d=i.length;d;)e=i[--d],a[e]=g[e];a.target||(a.target=g.srcElement||c),a.target.nodeType===3&&(a.target=a.target.parentNode),a.metaKey===b&&(a.metaKey=a.ctrlKey);return h.filter?h.filter(a,g):a},special:{ready:{setup:f.bindReady},load:{noBubble:!0},focus:{delegateType:"focusin"},blur:{delegateType:"focusout"},beforeunload:{setup:function(a,b,c){f.isWindow(this)&&(this.onbeforeunload=c)},teardown:function(a,b){this.onbeforeunload===b&&(this.onbeforeunload=null)}}},simulate:function(a,b,c,d){var e=f.extend(new f.Event,c,{type:a,isSimulated:!0,originalEvent:{}});d?f.event.trigger(e,null,b):f.event.dispatch.call(b,e),e.isDefaultPrevented()&&c.preventDefault()}},f.event.handle=f.event.dispatch,f.removeEvent=c.removeEventListener?function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c,!1)}:function(a,b,c){a.detachEvent&&a.detachEvent("on"+b,c)},f.Event=function(a,b){if(!(this instanceof f.Event))return new f.Event(a,b);a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||a.returnValue===!1||a.getPreventDefault&&a.getPreventDefault()?K:J):this.type=a,b&&f.extend(this,b),this.timeStamp=a&&a.timeStamp||f.now(),this[f.expando]=!0},f.Event.prototype={preventDefault:function(){this.isDefaultPrevented=K;var a=this.originalEvent;!a||(a.preventDefault?a.preventDefault():a.returnValue=!1)},stopPropagation:function(){this.isPropagationStopped=K;var a=this.originalEvent;!a||(a.stopPropagation&&a.stopPropagation(),a.cancelBubble=!0)},stopImmediatePropagation:function(){this.isImmediatePropagationStopped=K,this.stopPropagation()},isDefaultPrevented:J,isPropagationStopped:J,isImmediatePropagationStopped:J},f.each({mouseenter:"mouseover",mouseleave:"mouseout"},function(a,b){f.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c=this,d=a.relatedTarget,e=a.handleObj,g=e.selector,h;if(!d||d!==c&&!f.contains(c,d))a.type=e.origType,h=e.handler.apply(this,arguments),a.type=b;return h}}}),f.support.submitBubbles||(f.event.special.submit={setup:function(){if(f.nodeName(this,"form"))return!1;f.event.add(this,"click._submit keypress._submit",function(a){var c=a.target,d=f.nodeName(c,"input")||f.nodeName(c,"button")?c.form:b;d&&!d._submit_attached&&(f.event.add(d,"submit._submit",function(a){a._submit_bubble=!0}),d._submit_attached=!0)})},postDispatch:function(a){a._submit_bubble&&(delete a._submit_bubble,this.parentNode&&!a.isTrigger&&f.event.simulate("submit",this.parentNode,a,!0))},teardown:function(){if(f.nodeName(this,"form"))return!1;f.event.remove(this,"._submit")}}),f.support.changeBubbles||(f.event.special.change={setup:function(){if(z.test(this.nodeName)){if(this.type==="checkbox"||this.type==="radio")f.event.add(this,"propertychange._change",function(a){a.originalEvent.propertyName==="checked"&&(this._just_changed=!0)}),f.event.add(this,"click._change",function(a){this._just_changed&&!a.isTrigger&&(this._just_changed=!1,f.event.simulate("change",this,a,!0))});return!1}f.event.add(this,"beforeactivate._change",function(a){var b=a.target;z.test(b.nodeName)&&!b._change_attached&&(f.event.add(b,"change._change",function(a){this.parentNode&&!a.isSimulated&&!a.isTrigger&&f.event.simulate("change",this.parentNode,a,!0)}),b._change_attached=!0)})},handle:function(a){var b=a.target;if(this!==b||a.isSimulated||a.isTrigger||b.type!=="radio"&&b.type!=="checkbox")return a.handleObj.handler.apply(this,arguments)},teardown:function(){f.event.remove(this,"._change");return z.test(this.nodeName)}}),f.support.focusinBubbles||f.each({focus:"focusin",blur:"focusout"},function(a,b){var d=0,e=function(a){f.event.simulate(b,a.target,f.event.fix(a),!0)};f.event.special[b]={setup:function(){d++===0&&c.addEventListener(a,e,!0)},teardown:function(){--d===0&&c.removeEventListener(a,e,!0)}}}),f.fn.extend({on:function(a,c,d,e,g){var h,i;if(typeof a=="object"){typeof c!="string"&&(d=d||c,c=b);for(i in a)this.on(i,c,d,a[i],g);return this}d==null&&e==null?(e=c,d=c=b):e==null&&(typeof c=="string"?(e=d,d=b):(e=d,d=c,c=b));if(e===!1)e=J;else if(!e)return this;g===1&&(h=e,e=function(a){f().off(a);return h.apply(this,arguments)},e.guid=h.guid||(h.guid=f.guid++));return this.each(function(){f.event.add(this,a,e,d,c)})},one:function(a,b,c,d){return this.on(a,b,c,d,1)},off:function(a,c,d){if(a&&a.preventDefault&&a.handleObj){var e=a.handleObj;f(a.delegateTarget).off(e.namespace?e.origType+"."+e.namespace:e.origType,e.selector,e.handler);return this}if(typeof a=="object"){for(var g in a)this.off(g,c,a[g]);return this}if(c===!1||typeof c=="function")d=c,c=b;d===!1&&(d=J);return this.each(function(){f.event.remove(this,a,d,c)})},bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},live:function(a,b,c){f(this.context).on(a,this.selector,b,c);return this},die:function(a,b){f(this.context).off(a,this.selector||"**",b);return this},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return arguments.length==1?this.off(a,"**"):this.off(b,a,c)},trigger:function(a,b){return this.each(function(){f.event.trigger(a,b,this)})},triggerHandler:function(a,b){if(this[0])return f.event.trigger(a,b,this[0],!0)},toggle:function(a){var b=arguments,c=a.guid||f.guid++,d=0,e=function(c){var e=(f._data(this,"lastToggle"+a.guid)||0)%d;f._data(this,"lastToggle"+a.guid,e+1),c.preventDefault();return b[e].apply(this,arguments)||!1};e.guid=c;while(d<b.length)b[d++].guid=c;return this.click(e)},hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)}}),f.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){f.fn[b]=function(a,c){c==null&&(c=a,a=null);return arguments.length>0?this.on(b,null,a,c):this.trigger(b)},f.attrFn&&(f.attrFn[b]=!0),C.test(b)&&(f.event.fixHooks[b]=f.event.keyHooks),D.test(b)&&(f.event.fixHooks[b]=f.event.mouseHooks)}),function(){function x(a,b,c,e,f,g){for(var h=0,i=e.length;h<i;h++){var j=e[h];if(j){var k=!1;j=j[a];while(j){if(j[d]===c){k=e[j.sizset];break}if(j.nodeType===1){g||(j[d]=c,j.sizset=h);if(typeof b!="string"){if(j===b){k=!0;break}}else if(m.filter(b,[j]).length>0){k=j;break}}j=j[a]}e[h]=k}}}function w(a,b,c,e,f,g){for(var h=0,i=e.length;h<i;h++){var j=e[h];if(j){var k=!1;j=j[a];while(j){if(j[d]===c){k=e[j.sizset];break}j.nodeType===1&&!g&&(j[d]=c,j.sizset=h);if(j.nodeName.toLowerCase()===b){k=j;break}j=j[a]}e[h]=k}}}var a=/((?:\((?:\([^()]+\)|[^()]+)+\)|\[(?:\[[^\[\]]*\]|['"][^'"]*['"]|[^\[\]'"]+)+\]|\\.|[^ >+~,(\[\\]+)+|[>+~])(\s*,\s*)?((?:.|\r|\n)*)/g,d="sizcache"+(Math.random()+"").replace(".",""),e=0,g=Object.prototype.toString,h=!1,i=!0,j=/\\/g,k=/\r\n/g,l=/\W/;[0,0].sort(function(){i=!1;return 0});var m=function(b,d,e,f){e=e||[],d=d||c;var h=d;if(d.nodeType!==1&&d.nodeType!==9)return[];if(!b||typeof b!="string")return e;var i,j,k,l,n,q,r,t,u=!0,v=m.isXML(d),w=[],x=b;do{a.exec(""),i=a.exec(x);if(i){x=i[3],w.push(i[1]);if(i[2]){l=i[3];break}}}while(i);if(w.length>1&&p.exec(b))if(w.length===2&&o.relative[w[0]])j=y(w[0]+w[1],d,f);else{j=o.relative[w[0]]?[d]:m(w.shift(),d);while(w.length)b=w.shift(),o.relative[b]&&(b+=w.shift()),j=y(b,j,f)}else{!f&&w.length>1&&d.nodeType===9&&!v&&o.match.ID.test(w[0])&&!o.match.ID.test(w[w.length-1])&&(n=m.find(w.shift(),d,v),d=n.expr?m.filter(n.expr,n.set)[0]:n.set[0]);if(d){n=f?{expr:w.pop(),set:s(f)}:m.find(w.pop(),w.length===1&&(w[0]==="~"||w[0]==="+")&&d.parentNode?d.parentNode:d,v),j=n.expr?m.filter(n.expr,n.set):n.set,w.length>0?k=s(j):u=!1;while(w.length)q=w.pop(),r=q,o.relative[q]?r=w.pop():q="",r==null&&(r=d),o.relative[q](k,r,v)}else k=w=[]}k||(k=j),k||m.error(q||b);if(g.call(k)==="[object Array]")if(!u)e.push.apply(e,k);else if(d&&d.nodeType===1)for(t=0;k[t]!=null;t++)k[t]&&(k[t]===!0||k[t].nodeType===1&&m.contains(d,k[t]))&&e.push(j[t]);else for(t=0;k[t]!=null;t++)k[t]&&k[t].nodeType===1&&e.push(j[t]);else s(k,e);l&&(m(l,h,e,f),m.uniqueSort(e));return e};m.uniqueSort=function(a){if(u){h=i,a.sort(u);if(h)for(var b=1;b<a.length;b++)a[b]===a[b-1]&&a.splice(b--,1)}return a},m.matches=function(a,b){return m(a,null,null,b)},m.matchesSelector=function(a,b){return m(b,null,null,[a]).length>0},m.find=function(a,b,c){var d,e,f,g,h,i;if(!a)return[];for(e=0,f=o.order.length;e<f;e++){h=o.order[e];if(g=o.leftMatch[h].exec(a)){i=g[1],g.splice(1,1);if(i.substr(i.length-1)!=="\\"){g[1]=(g[1]||"").replace(j,""),d=o.find[h](g,b,c);if(d!=null){a=a.replace(o.match[h],"");break}}}}d||(d=typeof b.getElementsByTagName!="undefined"?b.getElementsByTagName("*"):[]);return{set:d,expr:a}},m.filter=function(a,c,d,e){var f,g,h,i,j,k,l,n,p,q=a,r=[],s=c,t=c&&c[0]&&m.isXML(c[0]);while(a&&c.length){for(h in o.filter)if((f=o.leftMatch[h].exec(a))!=null&&f[2]){k=o.filter[h],l=f[1],g=!1,f.splice(1,1);if(l.substr(l.length-1)==="\\")continue;s===r&&(r=[]);if(o.preFilter[h]){f=o.preFilter[h](f,s,d,r,e,t);if(!f)g=i=!0;else if(f===!0)continue}if(f)for(n=0;(j=s[n])!=null;n++)j&&(i=k(j,f,n,s),p=e^i,d&&i!=null?p?g=!0:s[n]=!1:p&&(r.push(j),g=!0));if(i!==b){d||(s=r),a=a.replace(o.match[h],"");if(!g)return[];break}}if(a===q)if(g==null)m.error(a);else break;q=a}return s},m.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)};var n=m.getText=function(a){var b,c,d=a.nodeType,e="";if(d){if(d===1||d===9||d===11){if(typeof a.textContent=="string")return a.textContent;if(typeof a.innerText=="string")return a.innerText.replace(k,"");for(a=a.firstChild;a;a=a.nextSibling)e+=n(a)}else if(d===3||d===4)return a.nodeValue}else for(b=0;c=a[b];b++)c.nodeType!==8&&(e+=n(c));return e},o=m.selectors={order:["ID","NAME","TAG"],match:{ID:/#((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,CLASS:/\.((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,NAME:/\[name=['"]*((?:[\w\u00c0-\uFFFF\-]|\\.)+)['"]*\]/,ATTR:/\[\s*((?:[\w\u00c0-\uFFFF\-]|\\.)+)\s*(?:(\S?=)\s*(?:(['"])(.*?)\3|(#?(?:[\w\u00c0-\uFFFF\-]|\\.)*)|)|)\s*\]/,TAG:/^((?:[\w\u00c0-\uFFFF\*\-]|\\.)+)/,CHILD:/:(only|nth|last|first)-child(?:\(\s*(even|odd|(?:[+\-]?\d+|(?:[+\-]?\d*)?n\s*(?:[+\-]\s*\d+)?))\s*\))?/,POS:/:(nth|eq|gt|lt|first|last|even|odd)(?:\((\d*)\))?(?=[^\-]|$)/,PSEUDO:/:((?:[\w\u00c0-\uFFFF\-]|\\.)+)(?:\((['"]?)((?:\([^\)]+\)|[^\(\)]*)+)\2\))?/},leftMatch:{},attrMap:{"class":"className","for":"htmlFor"},attrHandle:{href:function(a){return a.getAttribute("href")},type:function(a){return a.getAttribute("type")}},relative:{"+":function(a,b){var c=typeof b=="string",d=c&&!l.test(b),e=c&&!d;d&&(b=b.toLowerCase());for(var f=0,g=a.length,h;f<g;f++)if(h=a[f]){while((h=h.previousSibling)&&h.nodeType!==1);a[f]=e||h&&h.nodeName.toLowerCase()===b?h||!1:h===b}e&&m.filter(b,a,!0)},">":function(a,b){var c,d=typeof b=="string",e=0,f=a.length;if(d&&!l.test(b)){b=b.toLowerCase();for(;e<f;e++){c=a[e];if(c){var g=c.parentNode;a[e]=g.nodeName.toLowerCase()===b?g:!1}}}else{for(;e<f;e++)c=a[e],c&&(a[e]=d?c.parentNode:c.parentNode===b);d&&m.filter(b,a,!0)}},"":function(a,b,c){var d,f=e++,g=x;typeof b=="string"&&!l.test(b)&&(b=b.toLowerCase(),d=b,g=w),g("parentNode",b,f,a,d,c)},"~":function(a,b,c){var d,f=e++,g=x;typeof b=="string"&&!l.test(b)&&(b=b.toLowerCase(),d=b,g=w),g("previousSibling",b,f,a,d,c)}},find:{ID:function(a,b,c){if(typeof b.getElementById!="undefined"&&!c){var d=b.getElementById(a[1]);return d&&d.parentNode?[d]:[]}},NAME:function(a,b){if(typeof b.getElementsByName!="undefined"){var c=[],d=b.getElementsByName(a[1]);for(var e=0,f=d.length;e<f;e++)d[e].getAttribute("name")===a[1]&&c.push(d[e]);return c.length===0?null:c}},TAG:function(a,b){if(typeof b.getElementsByTagName!="undefined")return b.getElementsByTagName(a[1])}},preFilter:{CLASS:function(a,b,c,d,e,f){a=" "+a[1].replace(j,"")+" ";if(f)return a;for(var g=0,h;(h=b[g])!=null;g++)h&&(e^(h.className&&(" "+h.className+" ").replace(/[\t\n\r]/g," ").indexOf(a)>=0)?c||d.push(h):c&&(b[g]=!1));return!1},ID:function(a){return a[1].replace(j,"")},TAG:function(a,b){return a[1].replace(j,"").toLowerCase()},CHILD:function(a){if(a[1]==="nth"){a[2]||m.error(a[0]),a[2]=a[2].replace(/^\+|\s*/g,"");var b=/(-?)(\d*)(?:n([+\-]?\d*))?/.exec(a[2]==="even"&&"2n"||a[2]==="odd"&&"2n+1"||!/\D/.test(a[2])&&"0n+"+a[2]||a[2]);a[2]=b[1]+(b[2]||1)-0,a[3]=b[3]-0}else a[2]&&m.error(a[0]);a[0]=e++;return a},ATTR:function(a,b,c,d,e,f){var g=a[1]=a[1].replace(j,"");!f&&o.attrMap[g]&&(a[1]=o.attrMap[g]),a[4]=(a[4]||a[5]||"").replace(j,""),a[2]==="~="&&(a[4]=" "+a[4]+" ");return a},PSEUDO:function(b,c,d,e,f){if(b[1]==="not")if((a.exec(b[3])||"").length>1||/^\w/.test(b[3]))b[3]=m(b[3],null,null,c);else{var g=m.filter(b[3],c,d,!0^f);d||e.push.apply(e,g);return!1}else if(o.match.POS.test(b[0])||o.match.CHILD.test(b[0]))return!0;return b},POS:function(a){a.unshift(!0);return a}},filters:{enabled:function(a){return a.disabled===!1&&a.type!=="hidden"},disabled:function(a){return a.disabled===!0},checked:function(a){return a.checked===!0},selected:function(a){a.parentNode&&a.parentNode.selectedIndex;return a.selected===!0},parent:function(a){return!!a.firstChild},empty:function(a){return!a.firstChild},has:function(a,b,c){return!!m(c[3],a).length},header:function(a){return/h\d/i.test(a.nodeName)},text:function(a){var b=a.getAttribute("type"),c=a.type;return a.nodeName.toLowerCase()==="input"&&"text"===c&&(b===c||b===null)},radio:function(a){return a.nodeName.toLowerCase()==="input"&&"radio"===a.type},checkbox:function(a){return a.nodeName.toLowerCase()==="input"&&"checkbox"===a.type},file:function(a){return a.nodeName.toLowerCase()==="input"&&"file"===a.type},password:function(a){return a.nodeName.toLowerCase()==="input"&&"password"===a.type},submit:function(a){var b=a.nodeName.toLowerCase();return(b==="input"||b==="button")&&"submit"===a.type},image:function(a){return a.nodeName.toLowerCase()==="input"&&"image"===a.type},reset:function(a){var b=a.nodeName.toLowerCase();return(b==="input"||b==="button")&&"reset"===a.type},button:function(a){var b=a.nodeName.toLowerCase();return b==="input"&&"button"===a.type||b==="button"},input:function(a){return/input|select|textarea|button/i.test(a.nodeName)},focus:function(a){return a===a.ownerDocument.activeElement}},setFilters:{first:function(a,b){return b===0},last:function(a,b,c,d){return b===d.length-1},even:function(a,b){return b%2===0},odd:function(a,b){return b%2===1},lt:function(a,b,c){return b<c[3]-0},gt:function(a,b,c){return b>c[3]-0},nth:function(a,b,c){return c[3]-0===b},eq:function(a,b,c){return c[3]-0===b}},filter:{PSEUDO:function(a,b,c,d){var e=b[1],f=o.filters[e];if(f)return f(a,c,b,d);if(e==="contains")return(a.textContent||a.innerText||n([a])||"").indexOf(b[3])>=0;if(e==="not"){var g=b[3];for(var h=0,i=g.length;h<i;h++)if(g[h]===a)return!1;return!0}m.error(e)},CHILD:function(a,b){var c,e,f,g,h,i,j,k=b[1],l=a;switch(k){case"only":case"first":while(l=l.previousSibling)if(l.nodeType===1)return!1;if(k==="first")return!0;l=a;case"last":while(l=l.nextSibling)if(l.nodeType===1)return!1;return!0;case"nth":c=b[2],e=b[3];if(c===1&&e===0)return!0;f=b[0],g=a.parentNode;if(g&&(g[d]!==f||!a.nodeIndex)){i=0;for(l=g.firstChild;l;l=l.nextSibling)l.nodeType===1&&(l.nodeIndex=++i);g[d]=f}j=a.nodeIndex-e;return c===0?j===0:j%c===0&&j/c>=0}},ID:function(a,b){return a.nodeType===1&&a.getAttribute("id")===b},TAG:function(a,b){return b==="*"&&a.nodeType===1||!!a.nodeName&&a.nodeName.toLowerCase()===b},CLASS:function(a,b){return(" "+(a.className||a.getAttribute("class"))+" ").indexOf(b)>-1},ATTR:function(a,b){var c=b[1],d=m.attr?m.attr(a,c):o.attrHandle[c]?o.attrHandle[c](a):a[c]!=null?a[c]:a.getAttribute(c),e=d+"",f=b[2],g=b[4];return d==null?f==="!=":!f&&m.attr?d!=null:f==="="?e===g:f==="*="?e.indexOf(g)>=0:f==="~="?(" "+e+" ").indexOf(g)>=0:g?f==="!="?e!==g:f==="^="?e.indexOf(g)===0:f==="$="?e.substr(e.length-g.length)===g:f==="|="?e===g||e.substr(0,g.length+1)===g+"-":!1:e&&d!==!1},POS:function(a,b,c,d){var e=b[2],f=o.setFilters[e];if(f)return f(a,c,b,d)}}},p=o.match.POS,q=function(a,b){return"\\"+(b-0+1)};for(var r in o.match)o.match[r]=new RegExp(o.match[r].source+/(?![^\[]*\])(?![^\(]*\))/.source),o.leftMatch[r]=new RegExp(/(^(?:.|\r|\n)*?)/.source+o.match[r].source.replace(/\\(\d+)/g,q));o.match.globalPOS=p;var s=function(a,b){a=Array.prototype.slice.call(a,0);if(b){b.push.apply(b,a);return b}return a};try{Array.prototype.slice.call(c.documentElement.childNodes,0)[0].nodeType}catch(t){s=function(a,b){var c=0,d=b||[];if(g.call(a)==="[object Array]")Array.prototype.push.apply(d,a);else if(typeof a.length=="number")for(var e=a.length;c<e;c++)d.push(a[c]);else for(;a[c];c++)d.push(a[c]);return d}}var u,v;c.documentElement.compareDocumentPosition?u=function(a,b){if(a===b){h=!0;return 0}if(!a.compareDocumentPosition||!b.compareDocumentPosition)return a.compareDocumentPosition?-1:1;return a.compareDocumentPosition(b)&4?-1:1}:(u=function(a,b){if(a===b){h=!0;return 0}if(a.sourceIndex&&b.sourceIndex)return a.sourceIndex-b.sourceIndex;var c,d,e=[],f=[],g=a.parentNode,i=b.parentNode,j=g;if(g===i)return v(a,b);if(!g)return-1;if(!i)return 1;while(j)e.unshift(j),j=j.parentNode;j=i;while(j)f.unshift(j),j=j.parentNode;c=e.length,d=f.length;for(var k=0;k<c&&k<d;k++)if(e[k]!==f[k])return v(e[k],f[k]);return k===c?v(a,f[k],-1):v(e[k],b,1)},v=function(a,b,c){if(a===b)return c;var d=a.nextSibling;while(d){if(d===b)return-1;d=d.nextSibling}return 1}),function(){var a=c.createElement("div"),d="script"+(new Date).getTime(),e=c.documentElement;a.innerHTML="<a name='"+d+"'/>",e.insertBefore(a,e.firstChild),c.getElementById(d)&&(o.find.ID=function(a,c,d){if(typeof c.getElementById!="undefined"&&!d){var e=c.getElementById(a[1]);return e?e.id===a[1]||typeof e.getAttributeNode!="undefined"&&e.getAttributeNode("id").nodeValue===a[1]?[e]:b:[]}},o.filter.ID=function(a,b){var c=typeof a.getAttributeNode!="undefined"&&a.getAttributeNode("id");return a.nodeType===1&&c&&c.nodeValue===b}),e.removeChild(a),e=a=null}(),function(){var a=c.createElement("div");a.appendChild(c.createComment("")),a.getElementsByTagName("*").length>0&&(o.find.TAG=function(a,b){var c=b.getElementsByTagName(a[1]);if(a[1]==="*"){var d=[];for(var e=0;c[e];e++)c[e].nodeType===1&&d.push(c[e]);c=d}return c}),a.innerHTML="<a href='#'></a>",a.firstChild&&typeof a.firstChild.getAttribute!="undefined"&&a.firstChild.getAttribute("href")!=="#"&&(o.attrHandle.href=function(a){return a.getAttribute("href",2)}),a=null}(),c.querySelectorAll&&function(){var a=m,b=c.createElement("div"),d="__sizzle__";b.innerHTML="<p class='TEST'></p>";if(!b.querySelectorAll||b.querySelectorAll(".TEST").length!==0){m=function(b,e,f,g){e=e||c;if(!g&&!m.isXML(e)){var h=/^(\w+$)|^\.([\w\-]+$)|^#([\w\-]+$)/.exec(b);if(h&&(e.nodeType===1||e.nodeType===9)){if(h[1])return s(e.getElementsByTagName(b),f);if(h[2]&&o.find.CLASS&&e.getElementsByClassName)return s(e.getElementsByClassName(h[2]),f)}if(e.nodeType===9){if(b==="body"&&e.body)return s([e.body],f);if(h&&h[3]){var i=e.getElementById(h[3]);if(!i||!i.parentNode)return s([],f);if(i.id===h[3])return s([i],f)}try{return s(e.querySelectorAll(b),f)}catch(j){}}else if(e.nodeType===1&&e.nodeName.toLowerCase()!=="object"){var k=e,l=e.getAttribute("id"),n=l||d,p=e.parentNode,q=/^\s*[+~]/.test(b);l?n=n.replace(/'/g,"\\$&"):e.setAttribute("id",n),q&&p&&(e=e.parentNode);try{if(!q||p)return s(e.querySelectorAll("[id='"+n+"'] "+b),f)}catch(r){}finally{l||k.removeAttribute("id")}}}return a(b,e,f,g)};for(var e in a)m[e]=a[e];b=null}}(),function(){var a=c.documentElement,b=a.matchesSelector||a.mozMatchesSelector||a.webkitMatchesSelector||a.msMatchesSelector;if(b){var d=!b.call(c.createElement("div"),"div"),e=!1;try{b.call(c.documentElement,"[test!='']:sizzle")}catch(f){e=!0}m.matchesSelector=function(a,c){c=c.replace(/\=\s*([^'"\]]*)\s*\]/g,"='$1']");if(!m.isXML(a))try{if(e||!o.match.PSEUDO.test(c)&&!/!=/.test(c)){var f=b.call(a,c);if(f||!d||a.document&&a.document.nodeType!==11)return f}}catch(g){}return m(c,null,null,[a]).length>0}}}(),function(){var a=c.createElement("div");a.innerHTML="<div class='test e'></div><div class='test'></div>";if(!!a.getElementsByClassName&&a.getElementsByClassName("e").length!==0){a.lastChild.className="e";if(a.getElementsByClassName("e").length===1)return;o.order.splice(1,0,"CLASS"),o.find.CLASS=function(a,b,c){if(typeof b.getElementsByClassName!="undefined"&&!c)return b.getElementsByClassName(a[1])},a=null}}(),c.documentElement.contains?m.contains=function(a,b){return a!==b&&(a.contains?a.contains(b):!0)}:c.documentElement.compareDocumentPosition?m.contains=function(a,b){return!!(a.compareDocumentPosition(b)&16)}:m.contains=function(){return!1},m.isXML=function(a){var b=(a?a.ownerDocument||a:0).documentElement;return b?b.nodeName!=="HTML":!1};var y=function(a,b,c){var d,e=[],f="",g=b.nodeType?[b]:b;while(d=o.match.PSEUDO.exec(a))f+=d[0],a=a.replace(o.match.PSEUDO,"");a=o.relative[a]?a+"*":a;for(var h=0,i=g.length;h<i;h++)m(a,g[h],e,c);return m.filter(f,e)};m.attr=f.attr,m.selectors.attrMap={},f.find=m,f.expr=m.selectors,f.expr[":"]=f.expr.filters,f.unique=m.uniqueSort,f.text=m.getText,f.isXMLDoc=m.isXML,f.contains=m.contains}();var L=/Until$/,M=/^(?:parents|prevUntil|prevAll)/,N=/,/,O=/^.[^:#\[\.,]*$/,P=Array.prototype.slice,Q=f.expr.match.globalPOS,R={children:!0,contents:!0,next:!0,prev:!0};f.fn.extend({find:function(a){var b=this,c,d;if(typeof a!="string")return f(a).filter(function(){for(c=0,d=b.length;c<d;c++)if(f.contains(b[c],this))return!0});var e=this.pushStack("","find",a),g,h,i;for(c=0,d=this.length;c<d;c++){g=e.length,f.find(a,this[c],e);if(c>0)for(h=g;h<e.length;h++)for(i=0;i<g;i++)if(e[i]===e[h]){e.splice(h--,1);break}}return e},has:function(a){var b=f(a);return this.filter(function(){for(var a=0,c=b.length;a<c;a++)if(f.contains(this,b[a]))return!0})},not:function(a){return this.pushStack(T(this,a,!1),"not",a)},filter:function(a){return this.pushStack(T(this,a,!0),"filter",a)},is:function(a){return!!a&&(typeof a=="string"?Q.test(a)?f(a,this.context).index(this[0])>=0:f.filter(a,this).length>0:this.filter(a).length>0)},closest:function(a,b){var c=[],d,e,g=this[0];if(f.isArray(a)){var h=1;while(g&&g.ownerDocument&&g!==b){for(d=0;d<a.length;d++)f(g).is(a[d])&&c.push({selector:a[d],elem:g,level:h});g=g.parentNode,h++}return c}var i=Q.test(a)||typeof a!="string"?f(a,b||this.context):0;for(d=0,e=this.length;d<e;d++){g=this[d];while(g){if(i?i.index(g)>-1:f.find.matchesSelector(g,a)){c.push(g);break}g=g.parentNode;if(!g||!g.ownerDocument||g===b||g.nodeType===11)break}}c=c.length>1?f.unique(c):c;return this.pushStack(c,"closest",a)},index:function(a){if(!a)return this[0]&&this[0].parentNode?this.prevAll().length:-1;if(typeof a=="string")return f.inArray(this[0],f(a));return f.inArray(a.jquery?a[0]:a,this)},add:function(a,b){var c=typeof a=="string"?f(a,b):f.makeArray(a&&a.nodeType?[a]:a),d=f.merge(this.get(),c);return this.pushStack(S(c[0])||S(d[0])?d:f.unique(d))},andSelf:function(){return this.add(this.prevObject)}}),f.each({parent:function(a){var b=a.parentNode;return b&&b.nodeType!==11?b:null},parents:function(a){return f.dir(a,"parentNode")},parentsUntil:function(a,b,c){return f.dir(a,"parentNode",c)},next:function(a){return f.nth(a,2,"nextSibling")},prev:function(a){return f.nth(a,2,"previousSibling")},nextAll:function(a){return f.dir(a,"nextSibling")},prevAll:function(a){return f.dir(a,"previousSibling")},nextUntil:function(a,b,c){return f.dir(a,"nextSibling",c)},prevUntil:function(a,b,c){return f.dir(a,"previousSibling",c)},siblings:function(a){return f.sibling((a.parentNode||{}).firstChild,a)},children:function(a){return f.sibling(a.firstChild)},contents:function(a){return f.nodeName(a,"iframe")?a.contentDocument||a.contentWindow.document:f.makeArray(a.childNodes)}},function(a,b){f.fn[a]=function(c,d){var e=f.map(this,b,c);L.test(a)||(d=c),d&&typeof d=="string"&&(e=f.filter(d,e)),e=this.length>1&&!R[a]?f.unique(e):e,(this.length>1||N.test(d))&&M.test(a)&&(e=e.reverse());return this.pushStack(e,a,P.call(arguments).join(","))}}),f.extend({filter:function(a,b,c){c&&(a=":not("+a+")");return b.length===1?f.find.matchesSelector(b[0],a)?[b[0]]:[]:f.find.matches(a,b)},dir:function(a,c,d){var e=[],g=a[c];while(g&&g.nodeType!==9&&(d===b||g.nodeType!==1||!f(g).is(d)))g.nodeType===1&&e.push(g),g=g[c];return e},nth:function(a,b,c,d){b=b||1;var e=0;for(;a;a=a[c])if(a.nodeType===1&&++e===b)break;return a},sibling:function(a,b){var c=[];for(;a;a=a.nextSibling)a.nodeType===1&&a!==b&&c.push(a);return c}});var V="abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",W=/ jQuery\d+="(?:\d+|null)"/g,X=/^\s+/,Y=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/ig,Z=/<([\w:]+)/,$=/<tbody/i,_=/<|&#?\w+;/,ba=/<(?:script|style)/i,bb=/<(?:script|object|embed|option|style)/i,bc=new RegExp("<(?:"+V+")[\\s/>]","i"),bd=/checked\s*(?:[^=]|=\s*.checked.)/i,be=/\/(java|ecma)script/i,bf=/^\s*<!(?:\[CDATA\[|\-\-)/,bg={option:[1,"<select multiple='multiple'>","</select>"],legend:[1,"<fieldset>","</fieldset>"],thead:[1,"<table>","</table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],col:[2,"<table><tbody></tbody><colgroup>","</colgroup></table>"],area:[1,"<map>","</map>"],_default:[0,"",""]},bh=U(c);bg.optgroup=bg.option,bg.tbody=bg.tfoot=bg.colgroup=bg.caption=bg.thead,bg.th=bg.td,f.support.htmlSerialize||(bg._default=[1,"div<div>","</div>"]),f.fn.extend({text:function(a){return f.access(this,function(a){return a===b?f.text(this):this.empty().append((this[0]&&this[0].ownerDocument||c).createTextNode(a))},null,a,arguments.length)},wrapAll:function(a){if(f.isFunction(a))return this.each(function(b){f(this).wrapAll(a.call(this,b))});if(this[0]){var b=f(a,this[0].ownerDocument).eq(0).clone(!0);this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstChild&&a.firstChild.nodeType===1)a=a.firstChild;return a}).append(this)}return this},wrapInner:function(a){if(f.isFunction(a))return this.each(function(b){f(this).wrapInner(a.call(this,b))});return this.each(function(){var b=f(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=f.isFunction(a);return this.each(function(c){f(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){f.nodeName(this,"body")||f(this).replaceWith(this.childNodes)}).end()},append:function(){return this.domManip(arguments,!0,function(a){this.nodeType===1&&this.appendChild(a)})},prepend:function(){return this.domManip(arguments,!0,function(a){this.nodeType===1&&this.insertBefore(a,this.firstChild)})},before:function(){if(this[0]&&this[0].parentNode)return this.domManip(arguments,!1,function(a){this.parentNode.insertBefore(a,this)});if(arguments.length){var a=f
.clean(arguments);a.push.apply(a,this.toArray());return this.pushStack(a,"before",arguments)}},after:function(){if(this[0]&&this[0].parentNode)return this.domManip(arguments,!1,function(a){this.parentNode.insertBefore(a,this.nextSibling)});if(arguments.length){var a=this.pushStack(this,"after",arguments);a.push.apply(a,f.clean(arguments));return a}},remove:function(a,b){for(var c=0,d;(d=this[c])!=null;c++)if(!a||f.filter(a,[d]).length)!b&&d.nodeType===1&&(f.cleanData(d.getElementsByTagName("*")),f.cleanData([d])),d.parentNode&&d.parentNode.removeChild(d);return this},empty:function(){for(var a=0,b;(b=this[a])!=null;a++){b.nodeType===1&&f.cleanData(b.getElementsByTagName("*"));while(b.firstChild)b.removeChild(b.firstChild)}return this},clone:function(a,b){a=a==null?!1:a,b=b==null?a:b;return this.map(function(){return f.clone(this,a,b)})},html:function(a){return f.access(this,function(a){var c=this[0]||{},d=0,e=this.length;if(a===b)return c.nodeType===1?c.innerHTML.replace(W,""):null;if(typeof a=="string"&&!ba.test(a)&&(f.support.leadingWhitespace||!X.test(a))&&!bg[(Z.exec(a)||["",""])[1].toLowerCase()]){a=a.replace(Y,"<$1></$2>");try{for(;d<e;d++)c=this[d]||{},c.nodeType===1&&(f.cleanData(c.getElementsByTagName("*")),c.innerHTML=a);c=0}catch(g){}}c&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(a){if(this[0]&&this[0].parentNode){if(f.isFunction(a))return this.each(function(b){var c=f(this),d=c.html();c.replaceWith(a.call(this,b,d))});typeof a!="string"&&(a=f(a).detach());return this.each(function(){var b=this.nextSibling,c=this.parentNode;f(this).remove(),b?f(b).before(a):f(c).append(a)})}return this.length?this.pushStack(f(f.isFunction(a)?a():a),"replaceWith",a):this},detach:function(a){return this.remove(a,!0)},domManip:function(a,c,d){var e,g,h,i,j=a[0],k=[];if(!f.support.checkClone&&arguments.length===3&&typeof j=="string"&&bd.test(j))return this.each(function(){f(this).domManip(a,c,d,!0)});if(f.isFunction(j))return this.each(function(e){var g=f(this);a[0]=j.call(this,e,c?g.html():b),g.domManip(a,c,d)});if(this[0]){i=j&&j.parentNode,f.support.parentNode&&i&&i.nodeType===11&&i.childNodes.length===this.length?e={fragment:i}:e=f.buildFragment(a,this,k),h=e.fragment,h.childNodes.length===1?g=h=h.firstChild:g=h.firstChild;if(g){c=c&&f.nodeName(g,"tr");for(var l=0,m=this.length,n=m-1;l<m;l++)d.call(c?bi(this[l],g):this[l],e.cacheable||m>1&&l<n?f.clone(h,!0,!0):h)}k.length&&f.each(k,function(a,b){b.src?f.ajax({type:"GET",global:!1,url:b.src,async:!1,dataType:"script"}):f.globalEval((b.text||b.textContent||b.innerHTML||"").replace(bf,"/*$0*/")),b.parentNode&&b.parentNode.removeChild(b)})}return this}}),f.buildFragment=function(a,b,d){var e,g,h,i,j=a[0];b&&b[0]&&(i=b[0].ownerDocument||b[0]),i.createDocumentFragment||(i=c),a.length===1&&typeof j=="string"&&j.length<512&&i===c&&j.charAt(0)==="<"&&!bb.test(j)&&(f.support.checkClone||!bd.test(j))&&(f.support.html5Clone||!bc.test(j))&&(g=!0,h=f.fragments[j],h&&h!==1&&(e=h)),e||(e=i.createDocumentFragment(),f.clean(a,i,e,d)),g&&(f.fragments[j]=h?e:1);return{fragment:e,cacheable:g}},f.fragments={},f.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){f.fn[a]=function(c){var d=[],e=f(c),g=this.length===1&&this[0].parentNode;if(g&&g.nodeType===11&&g.childNodes.length===1&&e.length===1){e[b](this[0]);return this}for(var h=0,i=e.length;h<i;h++){var j=(h>0?this.clone(!0):this).get();f(e[h])[b](j),d=d.concat(j)}return this.pushStack(d,a,e.selector)}}),f.extend({clone:function(a,b,c){var d,e,g,h=f.support.html5Clone||f.isXMLDoc(a)||!bc.test("<"+a.nodeName+">")?a.cloneNode(!0):bo(a);if((!f.support.noCloneEvent||!f.support.noCloneChecked)&&(a.nodeType===1||a.nodeType===11)&&!f.isXMLDoc(a)){bk(a,h),d=bl(a),e=bl(h);for(g=0;d[g];++g)e[g]&&bk(d[g],e[g])}if(b){bj(a,h);if(c){d=bl(a),e=bl(h);for(g=0;d[g];++g)bj(d[g],e[g])}}d=e=null;return h},clean:function(a,b,d,e){var g,h,i,j=[];b=b||c,typeof b.createElement=="undefined"&&(b=b.ownerDocument||b[0]&&b[0].ownerDocument||c);for(var k=0,l;(l=a[k])!=null;k++){typeof l=="number"&&(l+="");if(!l)continue;if(typeof l=="string")if(!_.test(l))l=b.createTextNode(l);else{l=l.replace(Y,"<$1></$2>");var m=(Z.exec(l)||["",""])[1].toLowerCase(),n=bg[m]||bg._default,o=n[0],p=b.createElement("div"),q=bh.childNodes,r;b===c?bh.appendChild(p):U(b).appendChild(p),p.innerHTML=n[1]+l+n[2];while(o--)p=p.lastChild;if(!f.support.tbody){var s=$.test(l),t=m==="table"&&!s?p.firstChild&&p.firstChild.childNodes:n[1]==="<table>"&&!s?p.childNodes:[];for(i=t.length-1;i>=0;--i)f.nodeName(t[i],"tbody")&&!t[i].childNodes.length&&t[i].parentNode.removeChild(t[i])}!f.support.leadingWhitespace&&X.test(l)&&p.insertBefore(b.createTextNode(X.exec(l)[0]),p.firstChild),l=p.childNodes,p&&(p.parentNode.removeChild(p),q.length>0&&(r=q[q.length-1],r&&r.parentNode&&r.parentNode.removeChild(r)))}var u;if(!f.support.appendChecked)if(l[0]&&typeof (u=l.length)=="number")for(i=0;i<u;i++)bn(l[i]);else bn(l);l.nodeType?j.push(l):j=f.merge(j,l)}if(d){g=function(a){return!a.type||be.test(a.type)};for(k=0;j[k];k++){h=j[k];if(e&&f.nodeName(h,"script")&&(!h.type||be.test(h.type)))e.push(h.parentNode?h.parentNode.removeChild(h):h);else{if(h.nodeType===1){var v=f.grep(h.getElementsByTagName("script"),g);j.splice.apply(j,[k+1,0].concat(v))}d.appendChild(h)}}}return j},cleanData:function(a){var b,c,d=f.cache,e=f.event.special,g=f.support.deleteExpando;for(var h=0,i;(i=a[h])!=null;h++){if(i.nodeName&&f.noData[i.nodeName.toLowerCase()])continue;c=i[f.expando];if(c){b=d[c];if(b&&b.events){for(var j in b.events)e[j]?f.event.remove(i,j):f.removeEvent(i,j,b.handle);b.handle&&(b.handle.elem=null)}g?delete i[f.expando]:i.removeAttribute&&i.removeAttribute(f.expando),delete d[c]}}}});var bp=/alpha\([^)]*\)/i,bq=/opacity=([^)]*)/,br=/([A-Z]|^ms)/g,bs=/^[\-+]?(?:\d*\.)?\d+$/i,bt=/^-?(?:\d*\.)?\d+(?!px)[^\d\s]+$/i,bu=/^([\-+])=([\-+.\de]+)/,bv=/^margin/,bw={position:"absolute",visibility:"hidden",display:"block"},bx=["Top","Right","Bottom","Left"],by,bz,bA;f.fn.css=function(a,c){return f.access(this,function(a,c,d){return d!==b?f.style(a,c,d):f.css(a,c)},a,c,arguments.length>1)},f.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=by(a,"opacity");return c===""?"1":c}return a.style.opacity}}},cssNumber:{fillOpacity:!0,fontWeight:!0,lineHeight:!0,opacity:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":f.support.cssFloat?"cssFloat":"styleFloat"},style:function(a,c,d,e){if(!!a&&a.nodeType!==3&&a.nodeType!==8&&!!a.style){var g,h,i=f.camelCase(c),j=a.style,k=f.cssHooks[i];c=f.cssProps[i]||i;if(d===b){if(k&&"get"in k&&(g=k.get(a,!1,e))!==b)return g;return j[c]}h=typeof d,h==="string"&&(g=bu.exec(d))&&(d=+(g[1]+1)*+g[2]+parseFloat(f.css(a,c)),h="number");if(d==null||h==="number"&&isNaN(d))return;h==="number"&&!f.cssNumber[i]&&(d+="px");if(!k||!("set"in k)||(d=k.set(a,d))!==b)try{j[c]=d}catch(l){}}},css:function(a,c,d){var e,g;c=f.camelCase(c),g=f.cssHooks[c],c=f.cssProps[c]||c,c==="cssFloat"&&(c="float");if(g&&"get"in g&&(e=g.get(a,!0,d))!==b)return e;if(by)return by(a,c)},swap:function(a,b,c){var d={},e,f;for(f in b)d[f]=a.style[f],a.style[f]=b[f];e=c.call(a);for(f in b)a.style[f]=d[f];return e}}),f.curCSS=f.css,c.defaultView&&c.defaultView.getComputedStyle&&(bz=function(a,b){var c,d,e,g,h=a.style;b=b.replace(br,"-$1").toLowerCase(),(d=a.ownerDocument.defaultView)&&(e=d.getComputedStyle(a,null))&&(c=e.getPropertyValue(b),c===""&&!f.contains(a.ownerDocument.documentElement,a)&&(c=f.style(a,b))),!f.support.pixelMargin&&e&&bv.test(b)&&bt.test(c)&&(g=h.width,h.width=c,c=e.width,h.width=g);return c}),c.documentElement.currentStyle&&(bA=function(a,b){var c,d,e,f=a.currentStyle&&a.currentStyle[b],g=a.style;f==null&&g&&(e=g[b])&&(f=e),bt.test(f)&&(c=g.left,d=a.runtimeStyle&&a.runtimeStyle.left,d&&(a.runtimeStyle.left=a.currentStyle.left),g.left=b==="fontSize"?"1em":f,f=g.pixelLeft+"px",g.left=c,d&&(a.runtimeStyle.left=d));return f===""?"auto":f}),by=bz||bA,f.each(["height","width"],function(a,b){f.cssHooks[b]={get:function(a,c,d){if(c)return a.offsetWidth!==0?bB(a,b,d):f.swap(a,bw,function(){return bB(a,b,d)})},set:function(a,b){return bs.test(b)?b+"px":b}}}),f.support.opacity||(f.cssHooks.opacity={get:function(a,b){return bq.test((b&&a.currentStyle?a.currentStyle.filter:a.style.filter)||"")?parseFloat(RegExp.$1)/100+"":b?"1":""},set:function(a,b){var c=a.style,d=a.currentStyle,e=f.isNumeric(b)?"alpha(opacity="+b*100+")":"",g=d&&d.filter||c.filter||"";c.zoom=1;if(b>=1&&f.trim(g.replace(bp,""))===""){c.removeAttribute("filter");if(d&&!d.filter)return}c.filter=bp.test(g)?g.replace(bp,e):g+" "+e}}),f(function(){f.support.reliableMarginRight||(f.cssHooks.marginRight={get:function(a,b){return f.swap(a,{display:"inline-block"},function(){return b?by(a,"margin-right"):a.style.marginRight})}})}),f.expr&&f.expr.filters&&(f.expr.filters.hidden=function(a){var b=a.offsetWidth,c=a.offsetHeight;return b===0&&c===0||!f.support.reliableHiddenOffsets&&(a.style&&a.style.display||f.css(a,"display"))==="none"},f.expr.filters.visible=function(a){return!f.expr.filters.hidden(a)}),f.each({margin:"",padding:"",border:"Width"},function(a,b){f.cssHooks[a+b]={expand:function(c){var d,e=typeof c=="string"?c.split(" "):[c],f={};for(d=0;d<4;d++)f[a+bx[d]+b]=e[d]||e[d-2]||e[0];return f}}});var bC=/%20/g,bD=/\[\]$/,bE=/\r?\n/g,bF=/#.*$/,bG=/^(.*?):[ \t]*([^\r\n]*)\r?$/mg,bH=/^(?:color|date|datetime|datetime-local|email|hidden|month|number|password|range|search|tel|text|time|url|week)$/i,bI=/^(?:about|app|app\-storage|.+\-extension|file|res|widget):$/,bJ=/^(?:GET|HEAD)$/,bK=/^\/\//,bL=/\?/,bM=/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,bN=/^(?:select|textarea)/i,bO=/\s+/,bP=/([?&])_=[^&]*/,bQ=/^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/,bR=f.fn.load,bS={},bT={},bU,bV,bW=["*/"]+["*"];try{bU=e.href}catch(bX){bU=c.createElement("a"),bU.href="",bU=bU.href}bV=bQ.exec(bU.toLowerCase())||[],f.fn.extend({load:function(a,c,d){if(typeof a!="string"&&bR)return bR.apply(this,arguments);if(!this.length)return this;var e=a.indexOf(" ");if(e>=0){var g=a.slice(e,a.length);a=a.slice(0,e)}var h="GET";c&&(f.isFunction(c)?(d=c,c=b):typeof c=="object"&&(c=f.param(c,f.ajaxSettings.traditional),h="POST"));var i=this;f.ajax({url:a,type:h,dataType:"html",data:c,complete:function(a,b,c){c=a.responseText,a.isResolved()&&(a.done(function(a){c=a}),i.html(g?f("<div>").append(c.replace(bM,"")).find(g):c)),d&&i.each(d,[c,b,a])}});return this},serialize:function(){return f.param(this.serializeArray())},serializeArray:function(){return this.map(function(){return this.elements?f.makeArray(this.elements):this}).filter(function(){return this.name&&!this.disabled&&(this.checked||bN.test(this.nodeName)||bH.test(this.type))}).map(function(a,b){var c=f(this).val();return c==null?null:f.isArray(c)?f.map(c,function(a,c){return{name:b.name,value:a.replace(bE,"\r\n")}}):{name:b.name,value:c.replace(bE,"\r\n")}}).get()}}),f.each("ajaxStart ajaxStop ajaxComplete ajaxError ajaxSuccess ajaxSend".split(" "),function(a,b){f.fn[b]=function(a){return this.on(b,a)}}),f.each(["get","post"],function(a,c){f[c]=function(a,d,e,g){f.isFunction(d)&&(g=g||e,e=d,d=b);return f.ajax({type:c,url:a,data:d,success:e,dataType:g})}}),f.extend({getScript:function(a,c){return f.get(a,b,c,"script")},getJSON:function(a,b,c){return f.get(a,b,c,"json")},ajaxSetup:function(a,b){b?b$(a,f.ajaxSettings):(b=a,a=f.ajaxSettings),b$(a,b);return a},ajaxSettings:{url:bU,isLocal:bI.test(bV[1]),global:!0,type:"GET",contentType:"application/x-www-form-urlencoded; charset=UTF-8",processData:!0,async:!0,accepts:{xml:"application/xml, text/xml",html:"text/html",text:"text/plain",json:"application/json, text/javascript","*":bW},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText"},converters:{"* text":a.String,"text html":!0,"text json":f.parseJSON,"text xml":f.parseXML},flatOptions:{context:!0,url:!0}},ajaxPrefilter:bY(bS),ajaxTransport:bY(bT),ajax:function(a,c){function w(a,c,l,m){if(s!==2){s=2,q&&clearTimeout(q),p=b,n=m||"",v.readyState=a>0?4:0;var o,r,u,w=c,x=l?ca(d,v,l):b,y,z;if(a>=200&&a<300||a===304){if(d.ifModified){if(y=v.getResponseHeader("Last-Modified"))f.lastModified[k]=y;if(z=v.getResponseHeader("Etag"))f.etag[k]=z}if(a===304)w="notmodified",o=!0;else try{r=cb(d,x),w="success",o=!0}catch(A){w="parsererror",u=A}}else{u=w;if(!w||a)w="error",a<0&&(a=0)}v.status=a,v.statusText=""+(c||w),o?h.resolveWith(e,[r,w,v]):h.rejectWith(e,[v,w,u]),v.statusCode(j),j=b,t&&g.trigger("ajax"+(o?"Success":"Error"),[v,d,o?r:u]),i.fireWith(e,[v,w]),t&&(g.trigger("ajaxComplete",[v,d]),--f.active||f.event.trigger("ajaxStop"))}}typeof a=="object"&&(c=a,a=b),c=c||{};var d=f.ajaxSetup({},c),e=d.context||d,g=e!==d&&(e.nodeType||e instanceof f)?f(e):f.event,h=f.Deferred(),i=f.Callbacks("once memory"),j=d.statusCode||{},k,l={},m={},n,o,p,q,r,s=0,t,u,v={readyState:0,setRequestHeader:function(a,b){if(!s){var c=a.toLowerCase();a=m[c]=m[c]||a,l[a]=b}return this},getAllResponseHeaders:function(){return s===2?n:null},getResponseHeader:function(a){var c;if(s===2){if(!o){o={};while(c=bG.exec(n))o[c[1].toLowerCase()]=c[2]}c=o[a.toLowerCase()]}return c===b?null:c},overrideMimeType:function(a){s||(d.mimeType=a);return this},abort:function(a){a=a||"abort",p&&p.abort(a),w(0,a);return this}};h.promise(v),v.success=v.done,v.error=v.fail,v.complete=i.add,v.statusCode=function(a){if(a){var b;if(s<2)for(b in a)j[b]=[j[b],a[b]];else b=a[v.status],v.then(b,b)}return this},d.url=((a||d.url)+"").replace(bF,"").replace(bK,bV[1]+"//"),d.dataTypes=f.trim(d.dataType||"*").toLowerCase().split(bO),d.crossDomain==null&&(r=bQ.exec(d.url.toLowerCase()),d.crossDomain=!(!r||r[1]==bV[1]&&r[2]==bV[2]&&(r[3]||(r[1]==="http:"?80:443))==(bV[3]||(bV[1]==="http:"?80:443)))),d.data&&d.processData&&typeof d.data!="string"&&(d.data=f.param(d.data,d.traditional)),bZ(bS,d,c,v);if(s===2)return!1;t=d.global,d.type=d.type.toUpperCase(),d.hasContent=!bJ.test(d.type),t&&f.active++===0&&f.event.trigger("ajaxStart");if(!d.hasContent){d.data&&(d.url+=(bL.test(d.url)?"&":"?")+d.data,delete d.data),k=d.url;if(d.cache===!1){var x=f.now(),y=d.url.replace(bP,"$1_="+x);d.url=y+(y===d.url?(bL.test(d.url)?"&":"?")+"_="+x:"")}}(d.data&&d.hasContent&&d.contentType!==!1||c.contentType)&&v.setRequestHeader("Content-Type",d.contentType),d.ifModified&&(k=k||d.url,f.lastModified[k]&&v.setRequestHeader("If-Modified-Since",f.lastModified[k]),f.etag[k]&&v.setRequestHeader("If-None-Match",f.etag[k])),v.setRequestHeader("Accept",d.dataTypes[0]&&d.accepts[d.dataTypes[0]]?d.accepts[d.dataTypes[0]]+(d.dataTypes[0]!=="*"?", "+bW+"; q=0.01":""):d.accepts["*"]);for(u in d.headers)v.setRequestHeader(u,d.headers[u]);if(d.beforeSend&&(d.beforeSend.call(e,v,d)===!1||s===2)){v.abort();return!1}for(u in{success:1,error:1,complete:1})v[u](d[u]);p=bZ(bT,d,c,v);if(!p)w(-1,"No Transport");else{v.readyState=1,t&&g.trigger("ajaxSend",[v,d]),d.async&&d.timeout>0&&(q=setTimeout(function(){v.abort("timeout")},d.timeout));try{s=1,p.send(l,w)}catch(z){if(s<2)w(-1,z);else throw z}}return v},param:function(a,c){var d=[],e=function(a,b){b=f.isFunction(b)?b():b,d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};c===b&&(c=f.ajaxSettings.traditional);if(f.isArray(a)||a.jquery&&!f.isPlainObject(a))f.each(a,function(){e(this.name,this.value)});else for(var g in a)b_(g,a[g],c,e);return d.join("&").replace(bC,"+")}}),f.extend({active:0,lastModified:{},etag:{}});var cc=f.now(),cd=/(\=)\?(&|$)|\?\?/i;f.ajaxSetup({jsonp:"callback",jsonpCallback:function(){return f.expando+"_"+cc++}}),f.ajaxPrefilter("json jsonp",function(b,c,d){var e=typeof b.data=="string"&&/^application\/x\-www\-form\-urlencoded/.test(b.contentType);if(b.dataTypes[0]==="jsonp"||b.jsonp!==!1&&(cd.test(b.url)||e&&cd.test(b.data))){var g,h=b.jsonpCallback=f.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,i=a[h],j=b.url,k=b.data,l="$1"+h+"$2";b.jsonp!==!1&&(j=j.replace(cd,l),b.url===j&&(e&&(k=k.replace(cd,l)),b.data===k&&(j+=(/\?/.test(j)?"&":"?")+b.jsonp+"="+h))),b.url=j,b.data=k,a[h]=function(a){g=[a]},d.always(function(){a[h]=i,g&&f.isFunction(i)&&a[h](g[0])}),b.converters["script json"]=function(){g||f.error(h+" was not called");return g[0]},b.dataTypes[0]="json";return"script"}}),f.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/javascript|ecmascript/},converters:{"text script":function(a){f.globalEval(a);return a}}}),f.ajaxPrefilter("script",function(a){a.cache===b&&(a.cache=!1),a.crossDomain&&(a.type="GET",a.global=!1)}),f.ajaxTransport("script",function(a){if(a.crossDomain){var d,e=c.head||c.getElementsByTagName("head")[0]||c.documentElement;return{send:function(f,g){d=c.createElement("script"),d.async="async",a.scriptCharset&&(d.charset=a.scriptCharset),d.src=a.url,d.onload=d.onreadystatechange=function(a,c){if(c||!d.readyState||/loaded|complete/.test(d.readyState))d.onload=d.onreadystatechange=null,e&&d.parentNode&&e.removeChild(d),d=b,c||g(200,"success")},e.insertBefore(d,e.firstChild)},abort:function(){d&&d.onload(0,1)}}}});var ce=a.ActiveXObject?function(){for(var a in cg)cg[a](0,1)}:!1,cf=0,cg;f.ajaxSettings.xhr=a.ActiveXObject?function(){return!this.isLocal&&ch()||ci()}:ch,function(a){f.extend(f.support,{ajax:!!a,cors:!!a&&"withCredentials"in a})}(f.ajaxSettings.xhr()),f.support.ajax&&f.ajaxTransport(function(c){if(!c.crossDomain||f.support.cors){var d;return{send:function(e,g){var h=c.xhr(),i,j;c.username?h.open(c.type,c.url,c.async,c.username,c.password):h.open(c.type,c.url,c.async);if(c.xhrFields)for(j in c.xhrFields)h[j]=c.xhrFields[j];c.mimeType&&h.overrideMimeType&&h.overrideMimeType(c.mimeType),!c.crossDomain&&!e["X-Requested-With"]&&(e["X-Requested-With"]="XMLHttpRequest");try{for(j in e)h.setRequestHeader(j,e[j])}catch(k){}h.send(c.hasContent&&c.data||null),d=function(a,e){var j,k,l,m,n;try{if(d&&(e||h.readyState===4)){d=b,i&&(h.onreadystatechange=f.noop,ce&&delete cg[i]);if(e)h.readyState!==4&&h.abort();else{j=h.status,l=h.getAllResponseHeaders(),m={},n=h.responseXML,n&&n.documentElement&&(m.xml=n);try{m.text=h.responseText}catch(a){}try{k=h.statusText}catch(o){k=""}!j&&c.isLocal&&!c.crossDomain?j=m.text?200:404:j===1223&&(j=204)}}}catch(p){e||g(-1,p)}m&&g(j,k,m,l)},!c.async||h.readyState===4?d():(i=++cf,ce&&(cg||(cg={},f(a).unload(ce)),cg[i]=d),h.onreadystatechange=d)},abort:function(){d&&d(0,1)}}}});var cj={},ck,cl,cm=/^(?:toggle|show|hide)$/,cn=/^([+\-]=)?([\d+.\-]+)([a-z%]*)$/i,co,cp=[["height","marginTop","marginBottom","paddingTop","paddingBottom"],["width","marginLeft","marginRight","paddingLeft","paddingRight"],["opacity"]],cq;f.fn.extend({show:function(a,b,c){var d,e;if(a||a===0)return this.animate(ct("show",3),a,b,c);for(var g=0,h=this.length;g<h;g++)d=this[g],d.style&&(e=d.style.display,!f._data(d,"olddisplay")&&e==="none"&&(e=d.style.display=""),(e===""&&f.css(d,"display")==="none"||!f.contains(d.ownerDocument.documentElement,d))&&f._data(d,"olddisplay",cu(d.nodeName)));for(g=0;g<h;g++){d=this[g];if(d.style){e=d.style.display;if(e===""||e==="none")d.style.display=f._data(d,"olddisplay")||""}}return this},hide:function(a,b,c){if(a||a===0)return this.animate(ct("hide",3),a,b,c);var d,e,g=0,h=this.length;for(;g<h;g++)d=this[g],d.style&&(e=f.css(d,"display"),e!=="none"&&!f._data(d,"olddisplay")&&f._data(d,"olddisplay",e));for(g=0;g<h;g++)this[g].style&&(this[g].style.display="none");return this},_toggle:f.fn.toggle,toggle:function(a,b,c){var d=typeof a=="boolean";f.isFunction(a)&&f.isFunction(b)?this._toggle.apply(this,arguments):a==null||d?this.each(function(){var b=d?a:f(this).is(":hidden");f(this)[b?"show":"hide"]()}):this.animate(ct("toggle",3),a,b,c);return this},fadeTo:function(a,b,c,d){return this.filter(":hidden").css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){function g(){e.queue===!1&&f._mark(this);var b=f.extend({},e),c=this.nodeType===1,d=c&&f(this).is(":hidden"),g,h,i,j,k,l,m,n,o,p,q;b.animatedProperties={};for(i in a){g=f.camelCase(i),i!==g&&(a[g]=a[i],delete a[i]);if((k=f.cssHooks[g])&&"expand"in k){l=k.expand(a[g]),delete a[g];for(i in l)i in a||(a[i]=l[i])}}for(g in a){h=a[g],f.isArray(h)?(b.animatedProperties[g]=h[1],h=a[g]=h[0]):b.animatedProperties[g]=b.specialEasing&&b.specialEasing[g]||b.easing||"swing";if(h==="hide"&&d||h==="show"&&!d)return b.complete.call(this);c&&(g==="height"||g==="width")&&(b.overflow=[this.style.overflow,this.style.overflowX,this.style.overflowY],f.css(this,"display")==="inline"&&f.css(this,"float")==="none"&&(!f.support.inlineBlockNeedsLayout||cu(this.nodeName)==="inline"?this.style.display="inline-block":this.style.zoom=1))}b.overflow!=null&&(this.style.overflow="hidden");for(i in a)j=new f.fx(this,b,i),h=a[i],cm.test(h)?(q=f._data(this,"toggle"+i)||(h==="toggle"?d?"show":"hide":0),q?(f._data(this,"toggle"+i,q==="show"?"hide":"show"),j[q]()):j[h]()):(m=cn.exec(h),n=j.cur(),m?(o=parseFloat(m[2]),p=m[3]||(f.cssNumber[i]?"":"px"),p!=="px"&&(f.style(this,i,(o||1)+p),n=(o||1)/j.cur()*n,f.style(this,i,n+p)),m[1]&&(o=(m[1]==="-="?-1:1)*o+n),j.custom(n,o,p)):j.custom(n,h,""));return!0}var e=f.speed(b,c,d);if(f.isEmptyObject(a))return this.each(e.complete,[!1]);a=f.extend({},a);return e.queue===!1?this.each(g):this.queue(e.queue,g)},stop:function(a,c,d){typeof a!="string"&&(d=c,c=a,a=b),c&&a!==!1&&this.queue(a||"fx",[]);return this.each(function(){function h(a,b,c){var e=b[c];f.removeData(a,c,!0),e.stop(d)}var b,c=!1,e=f.timers,g=f._data(this);d||f._unmark(!0,this);if(a==null)for(b in g)g[b]&&g[b].stop&&b.indexOf(".run")===b.length-4&&h(this,g,b);else g[b=a+".run"]&&g[b].stop&&h(this,g,b);for(b=e.length;b--;)e[b].elem===this&&(a==null||e[b].queue===a)&&(d?e[b](!0):e[b].saveState(),c=!0,e.splice(b,1));(!d||!c)&&f.dequeue(this,a)})}}),f.each({slideDown:ct("show",1),slideUp:ct("hide",1),slideToggle:ct("toggle",1),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){f.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),f.extend({speed:function(a,b,c){var d=a&&typeof a=="object"?f.extend({},a):{complete:c||!c&&b||f.isFunction(a)&&a,duration:a,easing:c&&b||b&&!f.isFunction(b)&&b};d.duration=f.fx.off?0:typeof d.duration=="number"?d.duration:d.duration in f.fx.speeds?f.fx.speeds[d.duration]:f.fx.speeds._default;if(d.queue==null||d.queue===!0)d.queue="fx";d.old=d.complete,d.complete=function(a){f.isFunction(d.old)&&d.old.call(this),d.queue?f.dequeue(this,d.queue):a!==!1&&f._unmark(this)};return d},easing:{linear:function(a){return a},swing:function(a){return-Math.cos(a*Math.PI)/2+.5}},timers:[],fx:function(a,b,c){this.options=b,this.elem=a,this.prop=c,b.orig=b.orig||{}}}),f.fx.prototype={update:function(){this.options.step&&this.options.step.call(this.elem,this.now,this),(f.fx.step[this.prop]||f.fx.step._default)(this)},cur:function(){if(this.elem[this.prop]!=null&&(!this.elem.style||this.elem.style[this.prop]==null))return this.elem[this.prop];var a,b=f.css(this.elem,this.prop);return isNaN(a=parseFloat(b))?!b||b==="auto"?0:b:a},custom:function(a,c,d){function h(a){return e.step(a)}var e=this,g=f.fx;this.startTime=cq||cr(),this.end=c,this.now=this.start=a,this.pos=this.state=0,this.unit=d||this.unit||(f.cssNumber[this.prop]?"":"px"),h.queue=this.options.queue,h.elem=this.elem,h.saveState=function(){f._data(e.elem,"fxshow"+e.prop)===b&&(e.options.hide?f._data(e.elem,"fxshow"+e.prop,e.start):e.options.show&&f._data(e.elem,"fxshow"+e.prop,e.end))},h()&&f.timers.push(h)&&!co&&(co=setInterval(g.tick,g.interval))},show:function(){var a=f._data(this.elem,"fxshow"+this.prop);this.options.orig[this.prop]=a||f.style(this.elem,this.prop),this.options.show=!0,a!==b?this.custom(this.cur(),a):this.custom(this.prop==="width"||this.prop==="height"?1:0,this.cur()),f(this.elem).show()},hide:function(){this.options.orig[this.prop]=f._data(this.elem,"fxshow"+this.prop)||f.style(this.elem,this.prop),this.options.hide=!0,this.custom(this.cur(),0)},step:function(a){var b,c,d,e=cq||cr(),g=!0,h=this.elem,i=this.options;if(a||e>=i.duration+this.startTime){this.now=this.end,this.pos=this.state=1,this.update(),i.animatedProperties[this.prop]=!0;for(b in i.animatedProperties)i.animatedProperties[b]!==!0&&(g=!1);if(g){i.overflow!=null&&!f.support.shrinkWrapBlocks&&f.each(["","X","Y"],function(a,b){h.style["overflow"+b]=i.overflow[a]}),i.hide&&f(h).hide();if(i.hide||i.show)for(b in i.animatedProperties)f.style(h,b,i.orig[b]),f.removeData(h,"fxshow"+b,!0),f.removeData(h,"toggle"+b,!0);d=i.complete,d&&(i.complete=!1,d.call(h))}return!1}i.duration==Infinity?this.now=e:(c=e-this.startTime,this.state=c/i.duration,this.pos=f.easing[i.animatedProperties[this.prop]](this.state,c,0,1,i.duration),this.now=this.start+(this.end-this.start)*this.pos),this.update();return!0}},f.extend(f.fx,{tick:function(){var a,b=f.timers,c=0;for(;c<b.length;c++)a=b[c],!a()&&b[c]===a&&b.splice(c--,1);b.length||f.fx.stop()},interval:13,stop:function(){clearInterval(co),co=null},speeds:{slow:600,fast:200,_default:400},step:{opacity:function(a){f.style(a.elem,"opacity",a.now)},_default:function(a){a.elem.style&&a.elem.style[a.prop]!=null?a.elem.style[a.prop]=a.now+a.unit:a.elem[a.prop]=a.now}}}),f.each(cp.concat.apply([],cp),function(a,b){b.indexOf("margin")&&(f.fx.step[b]=function(a){f.style(a.elem,b,Math.max(0,a.now)+a.unit)})}),f.expr&&f.expr.filters&&(f.expr.filters.animated=function(a){return f.grep(f.timers,function(b){return a===b.elem}).length});var cv,cw=/^t(?:able|d|h)$/i,cx=/^(?:body|html)$/i;"getBoundingClientRect"in c.documentElement?cv=function(a,b,c,d){try{d=a.getBoundingClientRect()}catch(e){}if(!d||!f.contains(c,a))return d?{top:d.top,left:d.left}:{top:0,left:0};var g=b.body,h=cy(b),i=c.clientTop||g.clientTop||0,j=c.clientLeft||g.clientLeft||0,k=h.pageYOffset||f.support.boxModel&&c.scrollTop||g.scrollTop,l=h.pageXOffset||f.support.boxModel&&c.scrollLeft||g.scrollLeft,m=d.top+k-i,n=d.left+l-j;return{top:m,left:n}}:cv=function(a,b,c){var d,e=a.offsetParent,g=a,h=b.body,i=b.defaultView,j=i?i.getComputedStyle(a,null):a.currentStyle,k=a.offsetTop,l=a.offsetLeft;while((a=a.parentNode)&&a!==h&&a!==c){if(f.support.fixedPosition&&j.position==="fixed")break;d=i?i.getComputedStyle(a,null):a.currentStyle,k-=a.scrollTop,l-=a.scrollLeft,a===e&&(k+=a.offsetTop,l+=a.offsetLeft,f.support.doesNotAddBorder&&(!f.support.doesAddBorderForTableAndCells||!cw.test(a.nodeName))&&(k+=parseFloat(d.borderTopWidth)||0,l+=parseFloat(d.borderLeftWidth)||0),g=e,e=a.offsetParent),f.support.subtractsBorderForOverflowNotVisible&&d.overflow!=="visible"&&(k+=parseFloat(d.borderTopWidth)||0,l+=parseFloat(d.borderLeftWidth)||0),j=d}if(j.position==="relative"||j.position==="static")k+=h.offsetTop,l+=h.offsetLeft;f.support.fixedPosition&&j.position==="fixed"&&(k+=Math.max(c.scrollTop,h.scrollTop),l+=Math.max(c.scrollLeft,h.scrollLeft));return{top:k,left:l}},f.fn.offset=function(a){if(arguments.length)return a===b?this:this.each(function(b){f.offset.setOffset(this,a,b)});var c=this[0],d=c&&c.ownerDocument;if(!d)return null;if(c===d.body)return f.offset.bodyOffset(c);return cv(c,d,d.documentElement)},f.offset={bodyOffset:function(a){var b=a.offsetTop,c=a.offsetLeft;f.support.doesNotIncludeMarginInBodyOffset&&(b+=parseFloat(f.css(a,"marginTop"))||0,c+=parseFloat(f.css(a,"marginLeft"))||0);return{top:b,left:c}},setOffset:function(a,b,c){var d=f.css(a,"position");d==="static"&&(a.style.position="relative");var e=f(a),g=e.offset(),h=f.css(a,"top"),i=f.css(a,"left"),j=(d==="absolute"||d==="fixed")&&f.inArray("auto",[h,i])>-1,k={},l={},m,n;j?(l=e.position(),m=l.top,n=l.left):(m=parseFloat(h)||0,n=parseFloat(i)||0),f.isFunction(b)&&(b=b.call(a,c,g)),b.top!=null&&(k.top=b.top-g.top+m),b.left!=null&&(k.left=b.left-g.left+n),"using"in b?b.using.call(a,k):e.css(k)}},f.fn.extend({position:function(){if(!this[0])return null;var a=this[0],b=this.offsetParent(),c=this.offset(),d=cx.test(b[0].nodeName)?{top:0,left:0}:b.offset();c.top-=parseFloat(f.css(a,"marginTop"))||0,c.left-=parseFloat(f.css(a,"marginLeft"))||0,d.top+=parseFloat(f.css(b[0],"borderTopWidth"))||0,d.left+=parseFloat(f.css(b[0],"borderLeftWidth"))||0;return{top:c.top-d.top,left:c.left-d.left}},offsetParent:function(){return this.map(function(){var a=this.offsetParent||c.body;while(a&&!cx.test(a.nodeName)&&f.css(a,"position")==="static")a=a.offsetParent;return a})}}),f.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(a,c){var d=/Y/.test(c);f.fn[a]=function(e){return f.access(this,function(a,e,g){var h=cy(a);if(g===b)return h?c in h?h[c]:f.support.boxModel&&h.document.documentElement[e]||h.document.body[e]:a[e];h?h.scrollTo(d?f(h).scrollLeft():g,d?g:f(h).scrollTop()):a[e]=g},a,e,arguments.length,null)}}),f.each({Height:"height",Width:"width"},function(a,c){var d="client"+a,e="scroll"+a,g="offset"+a;f.fn["inner"+a]=function(){var a=this[0];return a?a.style?parseFloat(f.css(a,c,"padding")):this[c]():null},f.fn["outer"+a]=function(a){var b=this[0];return b?b.style?parseFloat(f.css(b,c,a?"margin":"border")):this[c]():null},f.fn[c]=function(a){return f.access(this,function(a,c,h){var i,j,k,l;if(f.isWindow(a)){i=a.document,j=i.documentElement[d];return f.support.boxModel&&j||i.body&&i.body[d]||j}if(a.nodeType===9){i=a.documentElement;if(i[d]>=i[e])return i[d];return Math.max(a.body[e],i[e],a.body[g],i[g])}if(h===b){k=f.css(a,c),l=parseFloat(k);return f.isNumeric(l)?l:k}f(a).css(c,h)},c,a,arguments.length,null)}}),a.jQuery=a.$=f,typeof define=="function"&&define.amd&&define.amd.jQuery&&define("jquery",[],function(){return f})})(window);;
  /*
 * jQuery Hotkeys Plugin
 * Copyright 2010, John Resig
 * Dual licensed under the MIT or GPL Version 2 licenses.
 *
 * Based upon the plugin by Tzury Bar Yochay:
 * http://github.com/tzuryby/hotkeys
 *
 * Original idea by:
 * Binny V A, http://www.openjs.com/scripts/events/keyboard_shortcuts/
*/

(function(jQuery){
	
	jQuery.hotkeys = {
		version: "0.8",

		specialKeys: {
			8: "backspace", 9: "tab", 13: "return", 16: "shift", 17: "ctrl", 18: "alt", 19: "pause",
			20: "capslock", 27: "esc", 32: "space", 33: "pageup", 34: "pagedown", 35: "end", 36: "home",
			37: "left", 38: "up", 39: "right", 40: "down", 45: "insert", 46: "del", 
			96: "0", 97: "1", 98: "2", 99: "3", 100: "4", 101: "5", 102: "6", 103: "7",
			104: "8", 105: "9", 106: "*", 107: "+", 109: "-", 110: ".", 111 : "/", 
			112: "f1", 113: "f2", 114: "f3", 115: "f4", 116: "f5", 117: "f6", 118: "f7", 119: "f8", 
			120: "f9", 121: "f10", 122: "f11", 123: "f12", 144: "numlock", 145: "scroll", 191: "/", 224: "meta"
		},
	
		shiftNums: {
			"\`": "~", "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", 
			"8": "*", "9": "(", "0": ")", "-": "_", "=": "+", ";": ": ", "'": "\"", ",": "<", 
			".": ">",  "/": "?",  "\\": "|"
		}
	};

	function keyHandler( handleObj ) {
		// Only care when a possible input has been specified
		if ( typeof handleObj.data !== "string" ) {
			return;
		}
		
		var origHandler = handleObj.handler,
			keys = handleObj.data.toLowerCase().split(" ");
	
		handleObj.handler = function( event ) {
			// Don't fire in text-accepting inputs that we didn't directly bind to
			if ( this !== event.target && (/textarea|select/i.test( event.target.nodeName ) ||
				 event.target.type === "text") ) {
				return;
			}
			
			// Keypress represents characters, not special keys
			var special = event.type !== "keypress" && jQuery.hotkeys.specialKeys[ event.which ],
				character = String.fromCharCode( event.which ).toLowerCase(),
				key, modif = "", possible = {};

			// check combinations (alt|ctrl|shift+anything)
			if ( event.altKey && special !== "alt" ) {
				modif += "alt+";
			}

			if ( event.ctrlKey && special !== "ctrl" ) {
				modif += "ctrl+";
			}
			
			// TODO: Need to make sure this works consistently across platforms
			if ( event.metaKey && !event.ctrlKey && special !== "meta" ) {
				modif += "meta+";
			}

			if ( event.shiftKey && special !== "shift" ) {
				modif += "shift+";
			}

			if ( special ) {
				possible[ modif + special ] = true;

			} else {
				possible[ modif + character ] = true;
				possible[ modif + jQuery.hotkeys.shiftNums[ character ] ] = true;

				// "$" can be triggered as "Shift+4" or "Shift+$" or just "$"
				if ( modif === "shift+" ) {
					possible[ jQuery.hotkeys.shiftNums[ character ] ] = true;
				}
			}

			for ( var i = 0, l = keys.length; i < l; i++ ) {
				if ( possible[ keys[i] ] ) {
					return origHandler.apply( this, arguments );
				}
			}
		};
	}

	jQuery.each([ "keydown", "keyup", "keypress" ], function() {
		jQuery.event.special[ this ] = { add: keyHandler };
	});

})( jQuery );;
  /*
    http://www.JSON.org/json2.js
    2011-10-19

    Public Domain.

    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

    See http://www.JSON.org/js.html


    This code should be minified before deployment.
    See http://javascript.crockford.com/jsmin.html

    USE YOUR OWN COPY. IT IS EXTREMELY UNWISE TO LOAD CODE FROM SERVERS YOU DO
    NOT CONTROL.


    This file creates a global JSON object containing two methods: stringify
    and parse.

        JSON.stringify(value, replacer, space)
            value       any JavaScript value, usually an object or array.

            replacer    an optional parameter that determines how object
                        values are stringified for objects. It can be a
                        function or an array of strings.

            space       an optional parameter that specifies the indentation
                        of nested structures. If it is omitted, the text will
                        be packed without extra whitespace. If it is a number,
                        it will specify the number of spaces to indent at each
                        level. If it is a string (such as '\t' or '&nbsp;'),
                        it contains the characters used to indent at each level.

            This method produces a JSON text from a JavaScript value.

            When an object value is found, if the object contains a toJSON
            method, its toJSON method will be called and the result will be
            stringified. A toJSON method does not serialize: it returns the
            value represented by the name/value pair that should be serialized,
            or undefined if nothing should be serialized. The toJSON method
            will be passed the key associated with the value, and this will be
            bound to the value

            For example, this would serialize Dates as ISO strings.

                Date.prototype.toJSON = function (key) {
                    function f(n) {
                        // Format integers to have at least two digits.
                        return n < 10 ? '0' + n : n;
                    }

                    return this.getUTCFullYear()   + '-' +
                         f(this.getUTCMonth() + 1) + '-' +
                         f(this.getUTCDate())      + 'T' +
                         f(this.getUTCHours())     + ':' +
                         f(this.getUTCMinutes())   + ':' +
                         f(this.getUTCSeconds())   + 'Z';
                };

            You can provide an optional replacer method. It will be passed the
            key and value of each member, with this bound to the containing
            object. The value that is returned from your method will be
            serialized. If your method returns undefined, then the member will
            be excluded from the serialization.

            If the replacer parameter is an array of strings, then it will be
            used to select the members to be serialized. It filters the results
            such that only members with keys listed in the replacer array are
            stringified.

            Values that do not have JSON representations, such as undefined or
            functions, will not be serialized. Such values in objects will be
            dropped; in arrays they will be replaced with null. You can use
            a replacer function to replace those with JSON values.
            JSON.stringify(undefined) returns undefined.

            The optional space parameter produces a stringification of the
            value that is filled with line breaks and indentation to make it
            easier to read.

            If the space parameter is a non-empty string, then that string will
            be used for indentation. If the space parameter is a number, then
            the indentation will be that many spaces.

            Example:

            text = JSON.stringify(['e', {pluribus: 'unum'}]);
            // text is '["e",{"pluribus":"unum"}]'


            text = JSON.stringify(['e', {pluribus: 'unum'}], null, '\t');
            // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'

            text = JSON.stringify([new Date()], function (key, value) {
                return this[key] instanceof Date ?
                    'Date(' + this[key] + ')' : value;
            });
            // text is '["Date(---current time---)"]'


        JSON.parse(text, reviver)
            This method parses a JSON text to produce an object or array.
            It can throw a SyntaxError exception.

            The optional reviver parameter is a function that can filter and
            transform the results. It receives each of the keys and values,
            and its return value is used instead of the original value.
            If it returns what it received, then the structure is not modified.
            If it returns undefined then the member is deleted.

            Example:

            // Parse the text. Values that look like ISO date strings will
            // be converted to Date objects.

            myData = JSON.parse(text, function (key, value) {
                var a;
                if (typeof value === 'string') {
                    a =
/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
                    if (a) {
                        return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4],
                            +a[5], +a[6]));
                    }
                }
                return value;
            });

            myData = JSON.parse('["Date(09/09/2001)"]', function (key, value) {
                var d;
                if (typeof value === 'string' &&
                        value.slice(0, 5) === 'Date(' &&
                        value.slice(-1) === ')') {
                    d = new Date(value.slice(5, -1));
                    if (d) {
                        return d;
                    }
                }
                return value;
            });


    This is a reference implementation. You are free to copy, modify, or
    redistribute.
*/

/*jslint evil: true, regexp: true */

/*members "", "\b", "\t", "\n", "\f", "\r", "\"", JSON, "\\", apply,
    call, charCodeAt, getUTCDate, getUTCFullYear, getUTCHours,
    getUTCMinutes, getUTCMonth, getUTCSeconds, hasOwnProperty, join,
    lastIndex, length, parse, prototype, push, replace, slice, stringify,
    test, toJSON, toString, valueOf
*/


// Create a JSON object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables.

var JSON;
if (!JSON) {
    JSON = {};
}

(function () {
    'use strict';

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    if (typeof Date.prototype.toJSON !== 'function') {

        Date.prototype.toJSON = function (key) {

            return isFinite(this.valueOf())
                ? this.getUTCFullYear()     + '-' +
                    f(this.getUTCMonth() + 1) + '-' +
                    f(this.getUTCDate())      + 'T' +
                    f(this.getUTCHours())     + ':' +
                    f(this.getUTCMinutes())   + ':' +
                    f(this.getUTCSeconds())   + 'Z'
                : null;
        };

        String.prototype.toJSON      =
            Number.prototype.toJSON  =
            Boolean.prototype.toJSON = function (key) {
                return this.valueOf();
            };
    }

    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        gap,
        indent,
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        },
        rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string'
                ? c
                : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === 'object' &&
                typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case 'string':
            return quote(value);

        case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

            return isFinite(value) ? String(value) : 'null';

        case 'boolean':
        case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

            return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

        case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

            if (!value) {
                return 'null';
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0
                    ? '[]'
                    : gap
                    ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']'
                    : '[' + partial.join(',') + ']';
                gap = mind;
                return v;
            }

// If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === 'object') {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    if (typeof rep[i] === 'string') {
                        k = rep[i];
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            } else {

// Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0
                ? '{}'
                : gap
                ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}'
                : '{' + partial.join(',') + '}';
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = '';
            indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === 'number') {
                for (i = 0; i < space; i += 1) {
                    indent += ' ';
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === 'string') {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== 'function' &&
                    (typeof replacer !== 'object' ||
                    typeof replacer.length !== 'number')) {
                throw new Error('JSON.stringify');
            }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

            return str('', {'': value});
        };
    }


// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            cx.lastIndex = 0;
            if (cx.test(text)) {
                text = text.replace(cx, function (a) {
                    return '\\u' +
                        ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (/^[\],:{}\s]*$/
                    .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                        .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                        .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function'
                    ? walk({'': j}, '')
                    : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        };
    }
}());;
  var $, Backend, BackendController, Controller, Events, Flakey, JSON, LocalBackend, MemoryBackend, Model, ServerBackend, SocketIOBackend, Stack, Template, get_template,
    __hasProp = Object.prototype.hasOwnProperty,
    __indexOf = Array.prototype.indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; },
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; },
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  Flakey = {
    diff_patch: new diff_match_patch(),
    settings: {
      diff_text: true,
      container: void 0,
      read_backend: 'memory',
      base_model_endpoint: null,
      socketio_server: null,
      enabled_local_backend: true
    },
    status: {
      server_online: void 0
    }
  };

  jQuery.noConflict();

  $ = Flakey.$ = jQuery;

  JSON = Flakey.JSON = JSON;

  Flakey.init = function(config) {
    var key, value;
    for (key in config) {
      if (!__hasProp.call(config, key)) continue;
      value = config[key];
      Flakey.settings[key] = value;
    }
    return Flakey.models.backend_controller = new Flakey.models.BackendController();
  };

  Flakey.util = {
    async: function(fn) {
      return setTimeout(fn, 0);
    },
    deep_compare: function(a, b) {
      var compare_objects;
      if (typeof a !== typeof b) return false;
      compare_objects = function(a, b) {
        var key, value;
        for (key in a) {
          value = a[key];
          if (!(b[key] != null)) return false;
        }
        for (key in b) {
          value = b[key];
          if (!(a[key] != null)) return false;
        }
        for (key in a) {
          value = a[key];
          if (value) {
            switch (typeof value) {
              case 'object':
                if (!compare_objects(value, b[key])) return false;
                break;
              default:
                if (value !== b[key]) return false;
            }
          } else {
            if (b[key]) return false;
          }
        }
        return true;
      };
      switch (typeof a) {
        case 'object':
          if (!compare_objects(a, b)) return false;
          break;
        default:
          if (a !== b) return false;
      }
      return true;
    },
    guid: function() {
      var guid;
      guid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
      guid = guid.replace(/[xy]/g, function(c) {
        var r, v;
        r = Math.random() * 16 | 0;
        if (c === 'x') {
          v = r;
        } else {
          v = r & 3 | 8;
        }
        v.toString(16).toUpperCase();
        return v;
      });
      return guid;
    },
    get_hash: function() {
      var hash;
      hash = window.location.hash;
      if (hash.indexOf('#') === 0) hash = hash.slice(1);
      return hash;
    },
    querystring: {
      parse: function(str) {
        var key, pair, pairs, params, value, _i, _len;
        if (!str || str.constructor !== String) return {};
        pairs = str.split('&');
        params = {};
        for (_i = 0, _len = pairs.length; _i < _len; _i++) {
          pair = pairs[_i];
          pair = pair.split('=');
          key = decodeURIComponent(pair[0]);
          value = decodeURIComponent(pair[1]);
          params[key] = value;
        }
        return params;
      },
      build: function(params) {
        var key, pairs, value;
        if (!params || params.constructor !== Object) return '';
        pairs = [];
        for (key in params) {
          if (!__hasProp.call(params, key)) continue;
          value = params[key];
          pairs.push("" + (encodeURIComponent(key)) + "=" + (encodeURIComponent(value)));
        }
        return pairs.join('&');
      },
      update: function(params, merge) {
        var hash, location, query;
        if (merge == null) merge = false;
        hash = Flakey.util.get_hash();
        if (hash.indexOf('?')) {
          hash = hash.split('?');
          location = hash[0];
          query = Flakey.util.querystring.parse(hash[1]);
        } else {
          location = hash;
          query = {};
        }
        if (merge) {
          $.extend(query, params);
        } else {
          query = params;
        }
        return window.location.hash = "" + location + "?" + (Flakey.util.querystring.build(query));
      }
    }
  };

  Events = (function() {

    function Events() {}

    Events.prototype.events = {};

    Events.prototype.register = function(event, fn, namespace) {
      if (namespace == null) namespace = 'flakey';
      if (this.events[namespace] === void 0) this.events[namespace] = {};
      if (this.events[namespace][event] === void 0) {
        this.events[namespace][event] = [];
      }
      this.events[namespace][event].push(fn);
      return this.events[namespace][event];
    };

    Events.prototype.trigger = function(event, namespace, data) {
      var fn, output, _i, _len, _ref;
      if (namespace == null) namespace = 'flakey';
      if (data == null) data = {};
      if (this.events[namespace] === void 0) this.events[namespace] = {};
      if (this.events[namespace][event] === void 0) return;
      output = [];
      _ref = this.events[namespace][event];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        fn = _ref[_i];
        output.push(fn(event, namespace, data));
      }
      return output;
    };

    Events.prototype.clear = function(namespace) {
      if (namespace == null) namespace = 'flakey';
      return this.events[namespace] = {};
    };

    return Events;

  })();

  Flakey.events = new Events();

  Model = (function() {

    Model.model_name = null;

    Model.fields = ['id'];

    function Model(init_values) {
      var key, value;
      this.id = Flakey.util.guid();
      this.versions = [];
      for (key in init_values) {
        if (!__hasProp.call(init_values, key)) continue;
        value = init_values[key];
        this[key] = value;
      }
    }

    Model.all = function() {
      var m, obj, set, _i, _len, _ref;
      set = [];
      _ref = Flakey.models.backend_controller.all(this.model_name);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        obj = _ref[_i];
        m = new this();
        m["import"](obj);
        set.push(m);
      }
      return set;
    };

    Model.find = function(query) {
      var ar, item, m, set, _i, _len;
      ar = Flakey.models.backend_controller.find(this.model_name, query);
      if (!ar.length) return [];
      set = [];
      for (_i = 0, _len = ar.length; _i < _len; _i++) {
        item = ar[_i];
        m = new this();
        m["import"](item);
        set.push(m);
      }
      return set;
    };

    Model.get = function(id) {
      var m, obj;
      obj = Flakey.models.backend_controller.get(this.model_name, id);
      if (!obj) return;
      m = new this();
      m["import"](obj);
      return m;
    };

    Model.search = function(re, fields) {
      var ar, item, key, m, query, set, _i, _j, _len, _len2;
      if (fields == null) fields = this.fields;
      query = {};
      for (_i = 0, _len = fields.length; _i < _len; _i++) {
        key = fields[_i];
        query[key] = re;
      }
      ar = Flakey.models.backend_controller.search(this.model_name, query);
      if (!ar.length) return [];
      set = [];
      for (_j = 0, _len2 = ar.length; _j < _len2; _j++) {
        item = ar[_j];
        m = new this();
        m["import"](item);
        set.push(m);
      }
      return set;
    };

    Model.prototype["delete"] = function() {
      var event_key;
      Flakey.models.backend_controller["delete"](this.constructor.model_name, this.id);
      event_key = "model_" + (this.constructor.model_name.toLowerCase()) + "_updated";
      return Flakey.events.trigger(event_key, void 0);
    };

    Model.prototype.rollback = function(version_id) {
      var exists, i, latest, version, _i, _j, _len, _len2, _ref, _ref2;
      if (parseInt(version_id) < this.versions.length) {
        _ref = Array(parseInt(version_id));
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          i = _ref[_i];
          this.pop_version();
        }
      } else {
        exists = false;
        _ref2 = this.versions;
        for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
          version = _ref2[_j];
          if (version.version_id === version_id) exists = true;
        }
        if (!exists) {
          throw new ReferenceError("Version " + version_id + " does not exist.");
        }
        latest = this.versions[this.versions.length - 1];
        while (latest.version_id !== version_id && this.versions.length > 1) {
          this.pop_version();
          latest = this.versions[this.versions.length - 1];
        }
      }
      this["import"]({
        id: this.id,
        versions: this.versions
      });
      return this.write();
    };

    Model.prototype.save = function(callback) {
      var diff, new_obj, old_obj;
      new_obj = this["export"]();
      old_obj = this.evolve();
      diff = this.diff(new_obj, old_obj);
      if (Object.keys(diff).length > 0) {
        this.push_version(diff);
        this.write(callback);
      } else if (callback != null) {
        callback();
      }
      return true;
    };

    Model.prototype.diff = function(new_obj, old_obj) {
      var key, patches, save, _i, _len, _ref;
      save = {};
      _ref = this.constructor.fields;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        key = _ref[_i];
        if (!Flakey.util.deep_compare(new_obj[key], old_obj[key])) {
          switch (new_obj[key].constructor) {
            case Object:
              save[key] = $.extend(true, {}, new_obj[key]);
              break;
            case Array:
              save[key] = $.extend(true, [], new_obj[key]);
              break;
            case String:
              old_obj[key] = old_obj[key] != null ? old_obj[key].toString() : '';
              if (Flakey.settings.diff_text) {
                patches = Flakey.diff_patch.patch_make(old_obj[key], new_obj[key]);
                save[key] = {
                  constructor: 'Patch',
                  patch_text: Flakey.diff_patch.patch_toText(patches)
                };
              } else {
                save[key] = new_obj[key];
              }
              break;
            default:
              save[key] = new_obj[key];
          }
        }
      }
      return save;
    };

    Model.prototype["export"] = function() {
      var field, obj, _i, _len, _ref;
      obj = {};
      _ref = this.constructor.fields;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        field = _ref[_i];
        obj[field] = this[field];
      }
      return obj;
    };

    Model.prototype.evolve = function(version_id, versions) {
      var key, obj, patches, rev, saved, value, _i, _len, _ref;
      obj = {};
      if (versions === void 0 || versions.constructor !== Array) {
        saved = Flakey.models.backend_controller.get(this.constructor.model_name, this.id);
        versions = saved != null ? saved.versions : {};
      }
      for (_i = 0, _len = versions.length; _i < _len; _i++) {
        rev = versions[_i];
        _ref = rev.fields;
        for (key in _ref) {
          if (!__hasProp.call(_ref, key)) continue;
          value = _ref[key];
          switch (value.constructor) {
            case 'Patch':
              patches = Flakey.diff_patch.patch_fromText(value.patch_text);
              obj[key] = Flakey.diff_patch.patch_apply(patches, obj[key] || '')[0];
              break;
            case Object:
              obj[key] = $.extend(true, {}, value);
              break;
            case Array:
              obj[key] = $.extend(true, [], value);
              break;
            default:
              obj[key] = value;
          }
        }
        if (version_id !== void 0 && version_id === rev.version_id) return obj;
      }
      return obj;
    };

    Model.prototype["import"] = function(obj) {
      var key, value, _i, _len, _ref, _ref2, _results;
      this.versions = obj.versions;
      this.id = obj.id;
      _ref = this.constructor.fields;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        key = _ref[_i];
        this[key] = void 0;
      }
      _ref2 = this.evolve(void 0, this.versions);
      _results = [];
      for (key in _ref2) {
        if (!__hasProp.call(_ref2, key)) continue;
        value = _ref2[key];
        _results.push(this[key] = value);
      }
      return _results;
    };

    Model.prototype.pop_version = function() {
      if (this.versions.length > 0) return this.versions.pop();
    };

    Model.prototype.push_version = function(diff) {
      var version, version_id;
      version_id = Flakey.util.guid();
      version = {
        version_id: version_id,
        time: +(new Date()),
        fields: $.extend(true, {}, diff)
      };
      Object.freeze(version);
      return this.versions.push(version);
    };

    Model.prototype.write = function(callback) {
      var _this = this;
      return Flakey.util.async(function() {
        var event_key;
        Flakey.models.backend_controller.save(_this.constructor.model_name, _this.id, _this.versions);
        if (callback != null) callback();
        event_key = "model_" + (_this.constructor.model_name.toLowerCase()) + "_updated";
        return Flakey.events.trigger(event_key, void 0);
      });
    };

    return Model;

  })();

  BackendController = (function() {

    function BackendController() {
      this.delim = ':::';
      this.backends = {
        memory: {
          log_key: 'flakey-memory-log',
          pending_log: [],
          interface: new MemoryBackend()
        }
      };
      if (Flakey.settings.enabled_local_backend) {
        this.backends['local'] = {
          log_key: 'flakey-local-log',
          pending_log: [],
          interface: new LocalBackend()
        };
      }
      if (Flakey.settings.base_model_endpoint) {
        this.backends['server'] = {
          log_key: 'flakey-server-log',
          pending_log: [],
          interface: new ServerBackend()
        };
      }
      if (Flakey.settings.socketio_server) {
        this.backends['socketio'] = {
          log_key: 'flakey-socketio-log',
          pending_log: [],
          interface: new SocketIOBackend()
        };
      }
      this.read = Flakey.settings.read_backend || 'memory';
      this.load_logs();
    }

    BackendController.prototype.all = function(name) {
      return this.backends[this.read].interface.all(name);
    };

    BackendController.prototype.get = function(name, id) {
      return this.backends[this.read].interface.get(name, id);
    };

    BackendController.prototype.find = function(name, query) {
      return this.backends[this.read].interface.find(name, query, false);
    };

    BackendController.prototype.search = function(name, re) {
      return this.backends[this.read].interface.find(name, re, true);
    };

    BackendController.prototype.save = function(name, id, versions, backends) {
      var backend, bname, log_msg;
      if (backends == null) backends = this.backends;
      for (bname in backends) {
        if (!__hasProp.call(backends, bname)) continue;
        backend = backends[bname];
        log_msg = 'save' + this.delim + JSON.stringify([name, id, versions]);
        if (backend.pending_log.length) {
          backend.pending_log.push(log_msg);
          this.commit_logs();
          this.exec_log();
          return false;
        }
        if (!backend.interface.save(name, id, versions)) {
          backend.pending_log.push(log_msg);
          this.commit_logs();
          return false;
        }
      }
      return true;
    };

    BackendController.prototype["delete"] = function(name, id, backends) {
      var backend, bname, log_msg;
      if (backends == null) backends = this.backends;
      for (bname in backends) {
        if (!__hasProp.call(backends, bname)) continue;
        backend = backends[bname];
        log_msg = 'delete' + this.delim + JSON.stringify([name, id]);
        if (backend.pending_log.length) {
          backend.pending_log.push(log_msg);
          this.commit_logs();
          this.exec_log();
          return false;
        }
        if (!backend.interface["delete"](name, id)) {
          backend.pending_log.push(log_msg);
          this.commit_logs();
          return false;
        }
      }
      return true;
    };

    BackendController.prototype.exec_log = function() {
      var action, backend, bends, fn, log, msg, name, params, _i, _len, _ref;
      _ref = this.backends;
      for (name in _ref) {
        if (!__hasProp.call(_ref, name)) continue;
        backend = _ref[name];
        log = backend.pending_log;
        for (_i = 0, _len = log.length; _i < _len; _i++) {
          msg = log[_i];
          if (msg != null) {
            action = msg.split(this.delim);
            fn = Flakey.models.backend_controller.backends[name].interface[action[0]];
            params = JSON.parse(action[1]);
            bends = {};
            bends[name] = backend;
            params.push(bends);
            if (fn.apply(Flakey.models.backend_controller.backends[name].interface, params)) {
              backend.pending_log.shift();
            } else {
              break;
            }
          }
        }
      }
      return this.commit_logs();
    };

    BackendController.prototype.commit_logs = function(backends) {
      var backend, name;
      if (backends == null) backends = this.backends;
      for (name in backends) {
        if (!__hasProp.call(backends, name)) continue;
        backend = backends[name];
        localStorage[backend.log_key] = JSON.stringify(backend.pending_log);
      }
      return true;
    };

    BackendController.prototype.load_logs = function(backends) {
      var backend, name;
      if (backends == null) backends = this.backends;
      for (name in backends) {
        if (!__hasProp.call(backends, name)) continue;
        backend = backends[name];
        if (!(localStorage[backend.log_key] != null)) break;
        backend.pending_log = JSON.parse(localStorage[backend.log_key]);
      }
      return true;
    };

    BackendController.prototype.sync = function(name, backends) {
      var backend, bname, event_key, item, key, output, store, _i, _len, _ref, _ref2;
      if (backends == null) backends = this.backends;
      store = {};
      for (bname in backends) {
        if (!__hasProp.call(backends, bname)) continue;
        backend = backends[bname];
        _ref = backend.interface.all(name);
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          item = _ref[_i];
          if (_ref2 = item.id, __indexOf.call(Object.keys(store), _ref2) >= 0) {
            store[item.id].versions = this.merge_version_lists(item.versions, store[item.id].versions);
          } else {
            store[item.id] = item;
          }
        }
      }
      output = [];
      for (key in store) {
        if (!__hasProp.call(store, key)) continue;
        item = store[key];
        output.push(item);
      }
      for (bname in backends) {
        if (!__hasProp.call(backends, bname)) continue;
        backend = backends[bname];
        backend.interface._write(name, output);
      }
      event_key = "model_" + (name.toLowerCase()) + "_updated";
      return Flakey.events.trigger(event_key, void 0);
    };

    BackendController.prototype.merge_version_lists = function(a, b) {
      var key, keys, output, rev, temp, value, _i, _j, _len, _len2, _ref, _ref2, _ref3;
      temp = {};
      _ref = a.concat(b);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        rev = _ref[_i];
        if (_ref2 = rev.time, __indexOf.call(Object.keys(temp), _ref2) >= 0) {
          if (rev.id !== temp[rev.time].id) {
            _ref3 = rev.fields;
            for (key in _ref3) {
              if (!__hasProp.call(_ref3, key)) continue;
              value = _ref3[key];
              temp[rev.time].fields[key] = value;
            }
          } else {
            temp[rev.time] = rev;
          }
        } else {
          temp[rev.time] = rev;
        }
      }
      keys = Object.keys(temp);
      keys.sort(function(a, b) {
        return a - b;
      });
      output = [];
      for (_j = 0, _len2 = keys.length; _j < _len2; _j++) {
        key = keys[_j];
        output.push(temp[key]);
      }
      return output;
    };

    return BackendController;

  })();

  Backend = (function() {

    function Backend() {}

    Backend.prototype.all = function(name) {
      var store;
      store = this._read(name);
      if (!store) return [];
      return store;
    };

    Backend.prototype["delete"] = function(name, id) {
      var index, store;
      store = this._read(name);
      index = this._query_by_id(name, id);
      if (index === -1) return true;
      store.splice(index, 1);
      return this._write(name, store);
    };

    Backend.prototype.find = function(name, query, full_text) {
      var i, out, set, store, _i, _len;
      if (full_text == null) full_text = false;
      store = this._read(name);
      set = full_text ? this._search(name, query) : this._query(name, query);
      out = [];
      for (_i = 0, _len = set.length; _i < _len; _i++) {
        i = set[_i];
        out.push(store[i]);
      }
      return out;
    };

    Backend.prototype.get = function(name, id) {
      var index, store;
      store = this._read(name);
      index = this._query_by_id(name, id);
      if (index === -1) return;
      return store[index];
    };

    Backend.prototype.save = function(name, id, versions) {
      var index, obj, store;
      store = this._read(name);
      if (!store) store = [];
      index = this._query_by_id(name, id);
      obj = {
        id: id,
        versions: versions
      };
      if (index === -1) {
        store.push(obj);
      } else {
        store[index] = obj;
      }
      return this._write(name, store);
    };

    Backend.prototype._query = function(name, query) {
      var i, key, match, obj, rendered, set, store, value, _i, _len;
      store = this._read(name);
      if (!store) return [];
      set = [];
      i = 0;
      for (_i = 0, _len = store.length; _i < _len; _i++) {
        obj = store[_i];
        rendered = this._render_obj(obj);
        match = true;
        for (key in query) {
          if (!__hasProp.call(query, key)) continue;
          value = query[key];
          if (rendered[key] !== value) match = false;
        }
        if (match) set.push(i);
        i++;
      }
      return set;
    };

    Backend.prototype._query_by_id = function(name, id) {
      var i, obj, store, _i, _len;
      store = this._read(name);
      if (!store) return -1;
      i = 0;
      for (_i = 0, _len = store.length; _i < _len; _i++) {
        obj = store[_i];
        if (obj.id === id) return i;
        i++;
      }
      return -1;
    };

    Backend.prototype._render_obj = function(obj) {
      var key, output, patches, rev, value, _i, _len, _ref, _ref2;
      output = {};
      _ref = obj.versions;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        rev = _ref[_i];
        _ref2 = rev.fields;
        for (key in _ref2) {
          if (!__hasProp.call(_ref2, key)) continue;
          value = _ref2[key];
          switch (value.constructor) {
            case 'Patch':
              patches = Flakey.diff_patch.patch_fromText(value.patch_text);
              obj[key] = Flakey.diff_patch.patch_apply(patches, obj[key] || '')[0];
              break;
            case Object:
              obj[key] = $.extend(true, {}, value);
              break;
            case Array:
              obj[key] = $.extend(true, [], value);
              break;
            default:
              obj[key] = value;
          }
        }
      }
      return obj;
    };

    Backend.prototype._search = function(name, query) {
      var i, key, match, obj, rendered, set, store, value, _i, _len;
      store = this._read(name);
      if (!store) return [];
      for (key in query) {
        if (!__hasProp.call(query, key)) continue;
        value = query[key];
        query[key] = new RegExp(value, "g");
      }
      set = [];
      i = 0;
      for (_i = 0, _len = store.length; _i < _len; _i++) {
        obj = store[_i];
        rendered = this._render_obj(obj);
        match = false;
        for (key in query) {
          if (!__hasProp.call(query, key)) continue;
          value = query[key];
          if (value.exec(rendered[key])) match = true;
        }
        if (match) set.push(i);
        i++;
      }
      return set;
    };

    return Backend;

  })();

  MemoryBackend = (function(_super) {

    __extends(MemoryBackend, _super);

    function MemoryBackend() {
      if (!window.memcache) window.memcache = {};
    }

    MemoryBackend.prototype._read = function(name) {
      return $.extend(true, [], window.memcache[name]);
    };

    MemoryBackend.prototype._write = function(name, store) {
      window.memcache[name] = $.extend(true, [], store);
      return true;
    };

    return MemoryBackend;

  })(Backend);

  LocalBackend = (function(_super) {

    __extends(LocalBackend, _super);

    function LocalBackend() {
      this.prefix = 'flakey-';
    }

    LocalBackend.prototype._read = function(name) {
      var store;
      if (!localStorage[this.prefix + name]) {
        localStorage[this.prefix + name] = JSON.stringify([]);
      }
      store = JSON.parse(localStorage[this.prefix + name]);
      return store;
    };

    LocalBackend.prototype._write = function(name, store) {
      localStorage[this.prefix + name] = JSON.stringify(store);
      return true;
    };

    return LocalBackend;

  })(Backend);

  ServerBackend = (function(_super) {

    __extends(ServerBackend, _super);

    function ServerBackend() {
      this.server_cache = {};
    }

    ServerBackend.prototype.build_endpoint_url = function(name, id, params) {
      var querystring, url;
      url = "" + Flakey.settings.base_model_endpoint + "/" + name;
      if (id != null) url += "/" + id;
      if ((params != null) && params.constructor === Object) {
        querystring = Flakey.util.querystring.build(params);
        url += "?" + querystring;
      }
      return url;
    };

    ServerBackend.prototype.all = function(name) {
      var obj, store, _i, _len;
      store = false;
      $.ajax({
        async: false,
        url: this.build_endpoint_url(name),
        dataType: 'json',
        error: function() {
          return Flakey.status.server_online = false;
        },
        success: function(data) {
          Flakey.status.server_online = true;
          return store = data;
        },
        type: 'GET'
      });
      for (_i = 0, _len = store.length; _i < _len; _i++) {
        obj = store[_i];
        this.save_to_cache(name, obj.id, obj.versions);
      }
      return store;
    };

    ServerBackend.prototype.get = function(name, id) {
      var obj;
      obj = false;
      $.ajax({
        async: false,
        url: this.build_endpoint_url(name, id),
        dataType: 'json',
        error: function() {
          return Flakey.status.server_online = false;
        },
        success: function(data) {
          Flakey.status.server_online = true;
          return obj = data;
        },
        type: 'GET'
      });
      this.save_to_cache(name, obj.id, obj.versions);
      return obj;
    };

    ServerBackend.prototype.get_from_cache = function(name, id) {
      if (this.server_cache[name]) {
        if (this.server_cache[name][id]) return this.server_cache[name][id];
      }
    };

    ServerBackend.prototype.save = function(name, id, versions, force_write) {
      var cached_obj, proposed_obj, status;
      proposed_obj = {
        id: id,
        versions: versions
      };
      cached_obj = this.get_from_cache(name, id);
      if (Flakey.util.deep_compare(proposed_obj, cached_obj) && force_write !== true) {
        return true;
      }
      status = false;
      $.ajax({
        async: false,
        url: this.build_endpoint_url(name, id),
        data: Flakey.util.querystring.build({
          id: id,
          versions: JSON.stringify(versions)
        }),
        dataType: 'json',
        error: function() {
          return Flakey.status.server_online = false;
        },
        success: function() {
          Flakey.status.server_online = true;
          return status = true;
        },
        type: 'POST'
      });
      return status;
    };

    ServerBackend.prototype.save_to_cache = function(name, id, versions) {
      this.server_cache[name] = this.server_cache[name] || {};
      return this.server_cache[name][id] = $.extend(true, {}, {
        id: id,
        versions: versions
      });
    };

    ServerBackend.prototype["delete"] = function(name, id) {
      var status;
      status = false;
      $.ajax({
        async: false,
        url: this.build_endpoint_url(name, id),
        dataType: 'json',
        error: function() {
          return Flakey.status.server_online = false;
        },
        success: function() {
          Flakey.status.server_online = true;
          return status = true;
        },
        type: 'DELETE'
      });
      return status;
    };

    ServerBackend.prototype._query = function(name, query) {
      throw new TypeError("_query not supported on server backend");
    };

    ServerBackend.prototype._query_by_id = function(name, id) {
      throw new TypeError("_query_by_id not supported on server backend");
    };

    ServerBackend.prototype._read = function(name) {
      return this.all(name);
    };

    ServerBackend.prototype._write = function(name, store) {
      var item, status, _i, _len;
      status = true;
      for (_i = 0, _len = store.length; _i < _len; _i++) {
        item = store[_i];
        if (!this.save(name, item.id, item.versions)) status = false;
      }
      return status;
    };

    return ServerBackend;

  })(Backend);

  SocketIOBackend = (function(_super) {

    __extends(SocketIOBackend, _super);

    function SocketIOBackend() {
      var _this = this;
      this.status = true;
      this.socket = window.socket = io.connect(Flakey.settings.socketio_server);
      this.server_cache = {};
      this.socket.on('sync', function(set) {
        var name, names, obj, _i, _j, _len, _len2, _ref, _results;
        names = [];
        for (_i = 0, _len = set.length; _i < _len; _i++) {
          obj = set[_i];
          if (_ref = obj.name, __indexOf.call(names, _ref) < 0) {
            names.push(obj.name);
          }
          _this.save_to_cache(obj.name, obj.id, obj.versions);
        }
        _results = [];
        for (_j = 0, _len2 = names.length; _j < _len2; _j++) {
          name = names[_j];
          _results.push(Flakey.models.backend_controller.sync(name));
        }
        return _results;
      });
      this.socket.emit('fetch_all');
    }

    SocketIOBackend.prototype.all = function(name) {
      var id, store, _i, _len, _ref;
      store = [];
      this.server_cache[name] = this.server_cache[name] || {};
      _ref = Object.keys(this.server_cache[name]);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        id = _ref[_i];
        store.push(this.get_from_cache(name, id));
      }
      return store;
    };

    SocketIOBackend.prototype.get = function(name, id) {
      return this.get_from_cache(name, id);
    };

    SocketIOBackend.prototype.get_from_cache = function(name, id) {
      if (this.server_cache[name]) {
        if (this.server_cache[name][id]) return this.server_cache[name][id];
      }
    };

    SocketIOBackend.prototype.save = function(name, id, versions, force_write) {
      var cached_obj, proposed_obj,
        _this = this;
      proposed_obj = {
        id: id,
        versions: versions
      };
      cached_obj = this.get_from_cache(name, id);
      if (Flakey.util.deep_compare(proposed_obj, cached_obj) && force_write !== true) {
        return true;
      }
      this.socket.emit('write', {
        name: name,
        id: id,
        versions: versions
      }, function() {
        return _this.save_to_cache(name, id, versions);
      });
      return this.status;
    };

    SocketIOBackend.prototype.save_to_cache = function(name, id, versions) {
      this.server_cache[name] = this.server_cache[name] || {};
      return this.server_cache[name][id] = $.extend(true, {}, {
        id: id,
        versions: versions
      });
    };

    SocketIOBackend.prototype["delete"] = function(name, id) {
      this.socket.emit('delete', {
        name: name,
        id: id
      });
      return this.status;
    };

    SocketIOBackend.prototype._query = function(name, query) {
      throw new TypeError("_query not supported on socketio backend");
    };

    SocketIOBackend.prototype._query_by_id = function(name, id) {
      throw new TypeError("_query_by_id not supported on socketio backend");
    };

    SocketIOBackend.prototype._read = function(name) {
      return this.all(name);
    };

    SocketIOBackend.prototype._write = function(name, store) {
      var item, status, _i, _len;
      status = true;
      for (_i = 0, _len = store.length; _i < _len; _i++) {
        item = store[_i];
        if (!this.save(name, item.id, item.versions)) status = false;
      }
      return status;
    };

    return SocketIOBackend;

  })(Backend);

  Flakey.models = {
    Model: Model,
    BackendController: BackendController,
    backend_controller: null
  };

  Controller = (function() {

    function Controller(config) {
      var name, _i, _len, _ref;
      if (config == null) config = {};
      this.active = this.active || false;
      this.actions = this.actions || {};
      this.id = this.id || '';
      this.class_name = this.class_name || '';
      this.parent = this.parent || null;
      this.container = this.container || null;
      this.container_html = this.container_html || '';
      this.subcontrollers = this.subcontrollers || [];
      this.query_params = this.query_params || {};
      this.container = $(document.createElement('div'));
      this.container.html(this.container_html);
      this.parent = config.parent || Flakey.settings.container;
      this.parent.append(this.container);
      this.container.attr('id', this.id);
      _ref = this.class_name.split(' ');
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        name = _ref[_i];
        this.container.addClass(name);
      }
    }

    Controller.prototype.append = function() {
      var Contr, contr, _i, _len, _results;
      _results = [];
      for (_i = 0, _len = arguments.length; _i < _len; _i++) {
        Contr = arguments[_i];
        contr = new Contr({
          parent: this.parent
        });
        _results.push(this.subcontrollers.push(contr));
      }
      return _results;
    };

    Controller.prototype.render = function() {
      return this.html('');
    };

    Controller.prototype.bind_actions = function() {
      var action, fn, hotkey, key, key_parts, selector, _ref, _results;
      _ref = this.actions;
      _results = [];
      for (key in _ref) {
        if (!__hasProp.call(_ref, key)) continue;
        fn = _ref[key];
        key_parts = key.split(' ');
        action = key_parts.shift();
        hotkey = "";
        if (action === 'keydown' || action === 'keyup' || action === 'keypress') {
          hotkey = key_parts.shift();
        }
        if ((hotkey.indexOf('#') !== -1 || hotkey.indexOf('.') !== -1) && hotkey.indexOf('+') === -1) {
          key_parts.shift(hotkey);
          hotkey = "";
        }
        selector = key_parts.join(' ');
        if (selector.length <= 0) selector = document;
        if (hotkey) {
          _results.push($(selector).bind(action, hotkey, this[fn]));
        } else {
          _results.push($(selector).bind(action, this[fn]));
        }
      }
      return _results;
    };

    Controller.prototype.unbind_actions = function() {
      return $(document).unbind();
    };

    Controller.prototype.html = function(htm) {
      this.container_html = htm;
      this.container.html(this.container_html);
      return Flakey.events.trigger('html_updated');
    };

    Controller.prototype.make_active = function() {
      var sub, _i, _len, _ref, _results;
      this.active = true;
      this.render();
      this.bind_actions();
      this.container.removeClass('passive').addClass('active');
      _ref = this.subcontrollers;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        sub = _ref[_i];
        _results.push(sub.make_active());
      }
      return _results;
    };

    Controller.prototype.make_inactive = function() {
      var sub, _i, _len, _ref, _results;
      this.active = false;
      this.unbind_actions();
      this.container.removeClass('active').addClass('passive');
      _ref = this.subcontrollers;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        sub = _ref[_i];
        _results.push(sub.make_inactive());
      }
      return _results;
    };

    Controller.prototype.set_queryparams = function(params) {
      var sub, _i, _len, _ref, _results;
      this.query_params = params;
      _ref = this.subcontrollers;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        sub = _ref[_i];
        _results.push(sub.set_queryparams(params));
      }
      return _results;
    };

    return Controller;

  })();

  Stack = (function() {

    function Stack(config) {
      var contr, name, _i, _len, _ref, _ref2;
      if (config == null) config = {};
      this.resolve = __bind(this.resolve, this);
      this.id = this.id || '';
      this.class_name = this.class_name || '';
      this.active = this.active || false;
      this.controllers = this.controllers || {};
      this.routes = this.routes || {};
      this["default"] = this["default"] || '';
      this.active_controller = this.active_controller || '';
      this.parent = this.parent || null;
      this.query_params = this.query_params || {};
      this.container = $(document.createElement('div'));
      this.container.attr('id', this.id);
      _ref = this.class_name.split(' ');
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        name = _ref[_i];
        this.container.addClass(name);
      }
      this.container.html(this.container_html);
      this.parent = config.parent || Flakey.settings.container;
      this.parent.append(this.container);
      _ref2 = this.controllers;
      for (name in _ref2) {
        if (!__hasProp.call(_ref2, name)) continue;
        contr = _ref2[name];
        this.controllers[name] = new contr({
          parent: this.container
        });
      }
      window.addEventListener('hashchange', this.resolve, false);
    }

    Stack.prototype.resolve = function() {
      var controller, controller_name, hash, location, name, new_controller, querystring, regex, route, _ref, _ref2;
      hash = Flakey.util.get_hash();
      new_controller = void 0;
      if (hash.length > 0) {
        if (hash.indexOf('?') !== -1) {
          hash = hash.split('?');
          location = hash[0];
          querystring = hash[1];
        } else {
          location = hash;
          querystring = '';
        }
        new_controller = void 0;
        _ref = this.routes;
        for (route in _ref) {
          if (!__hasProp.call(_ref, route)) continue;
          controller_name = _ref[route];
          regex = new RegExp(route);
          if (location.match(route)) new_controller = controller_name;
        }
      }
      if (!new_controller) {
        window.location.hash = "#" + this["default"];
        return;
      }
      this.active_controller = new_controller;
      this.controllers[this.active_controller].set_queryparams(Flakey.util.querystring.parse(querystring));
      _ref2 = this.controllers;
      for (name in _ref2) {
        if (!__hasProp.call(_ref2, name)) continue;
        controller = _ref2[name];
        if (name !== this.active_controller) {
          this.controllers[name].make_inactive();
        }
      }
      if (this.active) {
        this.controllers[this.active_controller].make_active();
        this.controllers[this.active_controller].render();
      }
      return this.controllers[this.active_controller];
    };

    Stack.prototype.make_active = function() {
      this.resolve();
      if (this.controllers[this.active_controller] !== void 0) {
        this.controllers[this.active_controller].make_active();
        this.controllers[this.active_controller].render();
      }
      return this.active = true;
    };

    Stack.prototype.make_inactive = function() {
      if (this.controllers[this.active_controller] !== void 0) {
        this.controllers[this.active_controller].make_inactive();
      }
      return this.active = false;
    };

    Stack.prototype.set_queryparams = function(params) {
      return this.query_params = params;
    };

    return Stack;

  })();

  Flakey.controllers = {
    Stack: Stack,
    Controller: Controller
  };

  Template = (function() {

    function Template(eco, name) {
      this.eco = eco;
      this.name = name;
    }

    Template.prototype.render = function(context) {
      if (context == null) context = {};
      return this.eco(context);
    };

    return Template;

  })();

  get_template = function(name, tobj) {
    var template;
    template = tobj.ecoTemplates[name];
    return new Template(template, name);
  };

  Flakey.templates = {
    get_template: get_template,
    Template: Template
  };

  if (typeof module !== "undefined" && module !== null) module.exports = Flakey;

  if (window) window.Flakey = Flakey;

}).call(this);

});

require.define("/lib/uikit.js", function (require, module, exports, __dirname, __filename) {
var ui = {};
module.exports = ui;

;(function(exports){

/**
 * Expose `Emitter`.
 */

exports.Emitter = Emitter;

/**
 * Initialize a new `Emitter`.
 * 
 * @api public
 */

function Emitter() {
  this.callbacks = {};
};

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on = function(event, fn){
  (this.callbacks[event] = this.callbacks[event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  var self = this;

  function on() {
    self.off(event, on);
    fn.apply(this, arguments);
  }

  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off = function(event, fn){
  var callbacks = this.callbacks[event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this.callbacks[event];
    return this;
  }

  // remove specific handler
  var i = callbacks.indexOf(fn);
  callbacks.splice(i, 1);
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter} 
 */

Emitter.prototype.emit = function(event){
  var args = [].slice.call(arguments, 1)
    , callbacks = this.callbacks[event];

  if (callbacks) {
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args)
    }
  }

  return this;
};

})(ui);
;(function(exports, html){

/**
 * Active dialog.
 */

var active;

/**
 * Expose `Dialog`.
 */

exports.Dialog = Dialog;

/**
 * Return a new `Dialog` with the given 
 * (optional) `title` and `msg`.
 *
 * @param {String} title or msg
 * @param {String} msg
 * @return {Dialog}
 * @api public
 */

exports.dialog = function(title, msg){
  switch (arguments.length) {
    case 2:
      return new Dialog({ title: title, message: msg });
    case 1:
      return new Dialog({ message: title });
  }
};

/**
 * Initialize a new `Dialog`.
 *
 * Options:
 *
 *    - `title` dialog title
 *    - `message` a message to display
 *
 * @param {Object} options
 * @api public
 */

function Dialog(options) {
  ui.Emitter.call(this);
  options = options || {};
  this.template = html;
  this.el = $(this.template);
  this.render(options);
  if (active) active.hide();
  if (Dialog.effect) this.effect(Dialog.effect);
  active = this;
};

/**
 * Inherit from `Emitter.prototype`.
 */

Dialog.prototype = new ui.Emitter;

/**
 * Render with the given `options`.
 *
 * @param {Object} options
 * @api public
 */

Dialog.prototype.render = function(options){
  var el = this.el
    , title = options.title
    , msg = options.message
    , self = this;

  el.find('.close').click(function(){
    self.emit('close');
    self.hide();
    return false;
  });

  el.find('h1').text(title);
  if (!title) el.find('h1').remove();

  // message
  if ('string' == typeof msg) {
    el.find('p').text(msg);
  } else if (msg) {
    el.find('p').replaceWith(msg.el || msg);
  }

  setTimeout(function(){
    el.removeClass('hide');
  }, 0);
};

/**
 * Enable the dialog close link.
 *
 * @return {Dialog} for chaining
 * @api public
 */

Dialog.prototype.closable = function(){
  this.el.addClass('closable');
  return this;
};

/**
 * Set the effect to `type`.
 *
 * @param {String} type
 * @return {Dialog} for chaining
 * @api public
 */

Dialog.prototype.effect = function(type){
  this._effect = type;
  this.el.addClass(type);
  return this;
};

/**
 * Make it modal!
 *
 * @return {Dialog} for chaining
 * @api public
 */

Dialog.prototype.modal = function(){
  this._overlay = ui.overlay();
  return this;
};

/**
 * Add an overlay.
 *
 * @return {Dialog} for chaining
 * @api public
 */

Dialog.prototype.overlay = function(){
  var self = this;
  this._overlay = ui
    .overlay({ closable: true })
    .on('hide', function(){
      self.closedOverlay = true;
      self.hide();
    });
  return this;
};

/**
 * Show the dialog.
 *
 * Emits "show" event.
 *
 * @return {Dialog} for chaining
 * @api public
 */

Dialog.prototype.show = function(){
  this.emit('show');
  if (this._overlay) {
    this._overlay.show();
    this.el.addClass('modal');
  }
  this.el.appendTo('body');
  this.el.css({ marginLeft: -(this.el.width() / 2) + 'px' });
  return this;
};

/**
 * Hide the dialog with optional delay of `ms`,
 * otherwise the dialog is removed immediately.
 *
 * Emits "hide" event.
 *
 * @return {Number} ms
 * @return {Dialog} for chaining
 * @api public
 */

Dialog.prototype.hide = function(ms){
  var self = this;
  this.emit('hide');

  // duration
  if (ms) {
    setTimeout(function(){
      self.hide();
    }, ms);
    return this;
  }

  // hide / remove
  this.el.addClass('hide');
  if (this._effect) {
    setTimeout(function(self){
      self.remove();
    }, 500, this);
  } else {
    self.remove();
  }

  // modal
  if (this._overlay && !self.closedOverlay) this._overlay.hide();

  return this;
};

/**
 * Hide the dialog without potential animation.
 *
 * @return {Dialog} for chaining
 * @api public
 */

Dialog.prototype.remove = function(){
  this.el.remove();
  return this;
};

})(ui, "<div id=\"dialog\" class=\"hide\">\n  <div class=\"content\">\n    <h1>Title</h1>\n    <a href=\"#\" class=\"close\">×</a>\n    <p>Message</p>\n  </div>\n</div>");
;(function(exports, html){

/**
 * Expose `Overlay`.
 */

exports.Overlay = Overlay;

/**
 * Return a new `Overlay` with the given `options`.
 *
 * @param {Object} options
 * @return {Overlay}
 * @api public
 */

exports.overlay = function(options){
  return new Overlay(options);
};

/**
 * Initialize a new `Overlay`.
 *
 * @param {Object} options
 * @api public
 */

function Overlay(options) {
  ui.Emitter.call(this);
  var self = this;
  options = options || {};
  this.closable = options.closable;
  this.el = $(html);
  this.el.appendTo('body');
  if (this.closable) {
    this.el.click(function(){
      self.hide();
    });
  }
}

/**
 * Inherit from `Emitter.prototype`.
 */

Overlay.prototype = new ui.Emitter;

/**
 * Show the overlay.
 *
 * Emits "show" event.
 *
 * @return {Overlay} for chaining
 * @api public
 */

Overlay.prototype.show = function(){
  this.emit('show');
  this.el.removeClass('hide');
  return this;
};

/**
 * Hide the overlay.
 *
 * Emits "hide" event.
 *
 * @return {Overlay} for chaining
 * @api public
 */

Overlay.prototype.hide = function(){
  var self = this;
  this.emit('hide');
  this.el.addClass('hide');
  setTimeout(function(){
    self.el.remove();
  }, 2000);
  return this;
};

})(ui, "<div id=\"overlay\" class=\"hide\"></div>");
;(function(exports, html){

/**
 * Expose `Confirmation`.
 */

exports.Confirmation = Confirmation;

/**
 * Return a new `Confirmation` dialog with the given 
 * `title` and `msg`.
 *
 * @param {String} title or msg
 * @param {String} msg
 * @return {Dialog}
 * @api public
 */

exports.confirm = function(title, msg){
  switch (arguments.length) {
    case 2:
      return new Confirmation({ title: title, message: msg });
    case 1:
      return new Confirmation({ message: title });
  }
};

/**
 * Initialize a new `Confirmation` dialog.
 *
 * Options:
 *
 *    - `title` dialog title
 *    - `message` a message to display
 *
 * @param {Object} options
 * @api public
 */

function Confirmation(options) {
  ui.Dialog.call(this, options);
};

/**
 * Inherit from `Dialog.prototype`.
 */

Confirmation.prototype = new ui.Dialog;

/**
 * Change "cancel" button `text`.
 *
 * @param {String} text
 * @return {Confirmation}
 * @api public
 */

Confirmation.prototype.cancel = function(text){
  this.el.find('.cancel').text(text);
  return this;
};

/**
 * Change "ok" button `text`.
 *
 * @param {String} text
 * @return {Confirmation}
 * @api public
 */

Confirmation.prototype.ok = function(text){
  this.el.find('.ok').text(text);
  return this;
};

/**
 * Show the confirmation dialog and invoke `fn(ok)`.
 *
 * @param {Function} fn
 * @return {Confirmation} for chaining
 * @api public
 */

Confirmation.prototype.show = function(fn){
  ui.Dialog.prototype.show.call(this);
  this.callback = fn || function(){};
  return this;
};

/**
 * Render with the given `options`.
 *
 * Emits "cancel" event.
 * Emits "ok" event.
 *
 * @param {Object} options
 * @api public
 */

Confirmation.prototype.render = function(options){
  ui.Dialog.prototype.render.call(this, options);
  var self = this
    , actions = $(html);

  this.el.addClass('confirmation');
  this.el.append(actions);

  this.on('close', function(){
    self.emit('cancel');
    self.callback(false);
  });

  actions.find('.cancel').click(function(){
    self.emit('cancel');
    self.callback(false);
    self.hide();
  });

  actions.find('.ok').click(function(){
    self.emit('ok');
    self.callback(true);
    self.hide();
  });
};

})(ui, "<div class=\"actions\">\n  <button class=\"cancel\">Cancel</button>\n  <button class=\"ok main\">Ok</button>\n</div>");
;(function(exports, html){

/**
 * Expose `ColorPicker`.
 */

exports.ColorPicker = ColorPicker;

/**
 * RGB util.
 */

function rgb(r,g,b) {
  return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

/**
 * RGBA util.
 */

function rgba(r,g,b,a) {
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
}

/**
 * Initialize a new `ColorPicker`.
 *
 * @param {Type} name
 * @return {Type}
 * @api public
 */

function ColorPicker() {
  ui.Emitter.call(this);
  this._colorPos = {};
  this.template = html;
  this.el = $(this.template);
  this.main = this.el.find('.main').get(0);
  this.spectrum = this.el.find('.spectrum').get(0);
  $(this.main).bind('selectstart', function(e){ e.preventDefault() });
  $(this.spectrum).bind('selectstart', function(e){ e.preventDefault() });
  this.hue(rgb(255, 0, 0));
  this.spectrumEvents();
  this.mainEvents();
  this.w = 180;
  this.h = 180;
  this.render();
}

/**
 * Inherit from `Emitter.prototype`.
 */

ColorPicker.prototype = new ui.Emitter;

/**
 * Set width / height to `n`.
 *
 * @param {Number} n
 * @return {ColorPicker} for chaining
 * @api public
 */

ColorPicker.prototype.size = function(n){
  return this
    .width(n)
    .height(n);
};

/**
 * Set width to `n`.
 *
 * @param {Number} n
 * @return {ColorPicker} for chaining
 * @api public
 */

ColorPicker.prototype.width = function(n){
  this.w = n;
  this.render();
  return this;
};

/**
 * Set height to `n`.
 *
 * @param {Number} n
 * @return {ColorPicker} for chaining
 * @api public
 */

ColorPicker.prototype.height = function(n){
  this.h = n;
  this.render();
  return this;
};

/**
 * Spectrum related events.
 *
 * @api private
 */

ColorPicker.prototype.spectrumEvents = function(){
  var self = this
    , canvas = $(this.spectrum)
    , down;

  function update(e) {
    var color = self.hueAt(e.offsetY);
    self.hue(color.toString());
    self.emit('change', color);
    self._huePos = e.offsetY;
    self.render();
  }

  canvas.mousedown(function(e){
    down = true;
    update(e);
  });

  canvas.mousemove(function(e){
    if (down) update(e);
  });

  canvas.mouseup(function(){
    down = false;
  });
};

/**
 * Hue / lightness events.
 *
 * @api private
 */

ColorPicker.prototype.mainEvents = function(){
  var self = this
    , canvas = $(this.main)
    , down;

  function update(e) {
    var color = self.colorAt(e.offsetX, e.offsetY);
    self.color(color.toString());
    self.emit('change', color);
    self._colorPos = e;
    self.render();
  }

  canvas.mousedown(function(e){
    down = true;
    update(e);
  });

  canvas.mousemove(function(e){
    if (down) update(e);
  });

  canvas.mouseup(function(){
    down = false;
  });
};

/**
 * Get the RGB color at `(x, y)`.
 *
 * @param {Number} x
 * @param {Number} y
 * @return {Object}
 * @api private
 */

ColorPicker.prototype.colorAt = function(x, y){
  var data = this.main.getContext('2d').getImageData(x, y, 1, 1).data;
  return {
      r: data[0]
    , g: data[1]
    , b: data[2]
    , toString: function(){
      return rgb(this.r, this.g, this.b);
    }
  };
};

/**
 * Get the RGB value at `y`. 
 *
 * @param {Type} name
 * @return {Type}
 * @api private
 */

ColorPicker.prototype.hueAt = function(y){
  var data = this.spectrum.getContext('2d').getImageData(0, y, 1, 1).data;
  return {
      r: data[0]
    , g: data[1]
    , b: data[2]
    , toString: function(){
      return rgb(this.r, this.g, this.b);
    }
  };
};

/**
 * Get or set `color`.
 *
 * @param {String} color
 * @return {String|ColorPicker}
 * @api public
 */

ColorPicker.prototype.color = function(color){
  // TODO: update pos
  if (0 == arguments.length) return this._color;
  this._color = color;
  return this;
};

/**
 * Get or set hue `color`.
 *
 * @param {String} color
 * @return {String|ColorPicker}
 * @api public
 */

ColorPicker.prototype.hue = function(color){
  // TODO: update pos
  if (0 == arguments.length) return this._hue;
  this._hue = color;
  return this;
};

/**
 * Render with the given `options`.
 *
 * @param {Object} options
 * @api public
 */

ColorPicker.prototype.render = function(options){
  options = options || {};
  this.renderMain(options);
  this.renderSpectrum(options);
};

/**
 * Render spectrum.
 *
 * @api private
 */

ColorPicker.prototype.renderSpectrum = function(options){
  var el = this.el
    , canvas = this.spectrum
    , ctx = canvas.getContext('2d')
    , pos = this._huePos
    , w = this.w * .12
    , h = this.h;

  canvas.width = w;
  canvas.height = h;

  var grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgb(255, 0, 0));
  grad.addColorStop(.15, rgb(255, 0, 255));
  grad.addColorStop(.33, rgb(0, 0, 255));
  grad.addColorStop(.49, rgb(0, 255, 255));
  grad.addColorStop(.67, rgb(0, 255, 0));
  grad.addColorStop(.84, rgb(255, 255, 0));
  grad.addColorStop(1, rgb(255, 0, 0));

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // pos
  if (!pos) return;
  ctx.fillStyle = rgba(0,0,0, .3);
  ctx.fillRect(0, pos, w, 1);
  ctx.fillStyle = rgba(255,255,255, .3);
  ctx.fillRect(0, pos + 1, w, 1);
};

/**
 * Render hue/luminosity canvas.
 *
 * @api private
 */

ColorPicker.prototype.renderMain = function(options){
  var el = this.el
    , canvas = this.main
    , ctx = canvas.getContext('2d')
    , w = this.w
    , h = this.h
    , x = (this._colorPos.offsetX || w) + .5
    , y = (this._colorPos.offsetY || 0) + .5;

  canvas.width = w;
  canvas.height = h;

  var grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, rgb(255, 255, 255));
  grad.addColorStop(1, this._hue);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgba(255, 255, 255, 0));
  grad.addColorStop(1, rgba(0, 0, 0, 1));

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // pos
  var rad = 10;
  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = 1;

  // outer dark
  ctx.strokeStyle = rgba(0,0,0,.5);
  ctx.arc(x, y, rad / 2, 0, Math.PI * 2, false);
  ctx.stroke();

  // outer light
  ctx.strokeStyle = rgba(255,255,255,.5);
  ctx.arc(x, y, rad / 2 - 1, 0, Math.PI * 2, false);
  ctx.stroke();

  ctx.beginPath();
  ctx.restore();
};
})(ui, "<div class=\"color-picker\">\n  <canvas class=\"main\"></canvas>\n  <canvas class=\"spectrum\"></canvas>\n</div>");
;(function(exports, html){

/**
 * Notification list.
 */

var list;

/**
 * Expose `Notification`.
 */

exports.Notification = Notification;

// list

$(function(){
  list = $('<ul id="notifications">');
  list.appendTo('body');
})

/**
 * Return a new `Notification` with the given 
 * (optional) `title` and `msg`.
 *
 * @param {String} title or msg
 * @param {String} msg
 * @return {Dialog}
 * @api public
 */

exports.notify = function(title, msg){
  switch (arguments.length) {
    case 2:
      return new Notification({ title: title, message: msg })
        .show()
        .hide(4000);
    case 1:
      return new Notification({ message: title })
        .show()
        .hide(4000);
  }
};

/**
 * Construct a notification function for `type`.
 *
 * @param {String} type
 * @return {Function}
 * @api private
 */

function type(type) {
  return function(title, msg){
    return exports.notify.apply(this, arguments)
      .type(type);
  }
}

/**
 * Notification methods.
 */

exports.info = exports.notify;
exports.warn = type('warn');
exports.error = type('error');

/**
 * Initialize a new `Notification`.
 *
 * Options:
 *
 *    - `title` dialog title
 *    - `message` a message to display
 *
 * @param {Object} options
 * @api public
 */

function Notification(options) {
  options = options || {};
  this.template = html;
  this.el = $(this.template);
  this.render(options);
  if (Notification.effect) this.effect(Notification.effect);
};


/**
 * Render with the given `options`.
 *
 * @param {Object} options
 * @api public
 */

Notification.prototype.render = function(options){
  var el = this.el
    , title = options.title
    , msg = options.message
    , self = this;

  el.find('.close').click(function(){
    self.hide();
    return false;
  });

  el.find('h1').text(title);
  if (!title) el.find('h1').remove();

  // message
  if ('string' == typeof msg) {
    el.find('p').text(msg);
  } else if (msg) {
    el.find('p').replaceWith(msg.el || msg);
  }

  setTimeout(function(){
    el.removeClass('hide');
  }, 0);
};

/**
 * Enable the dialog close link.
 *
 * @return {Notification} for chaining
 * @api public
 */

Notification.prototype.closable = function(){
  this.el.addClass('closable');
  return this;
};

/**
 * Set the effect to `type`.
 *
 * @param {String} type
 * @return {Notification} for chaining
 * @api public
 */

Notification.prototype.effect = function(type){
  this._effect = type;
  this.el.addClass(type);
  return this;
};

/**
 * Show the notification.
 *
 * @return {Notification} for chaining
 * @api public
 */

Notification.prototype.show = function(){
  this.el.appendTo(list);
  return this;
};

/**
 * Set the notification `type`.
 *
 * @param {String} type
 * @return {Notification} for chaining
 * @api public
 */

Notification.prototype.type = function(type){
  this._type = type;
  this.el.addClass(type);
  return this;
};

/**
 * Make it stick (clear hide timer), and make it closable.
 *
 * @return {Notification} for chaining
 * @api public
 */

Notification.prototype.sticky = function(){
  return this.hide(0).closable();
};

/**
 * Hide the dialog with optional delay of `ms`,
 * otherwise the notification is removed immediately.
 *
 * @return {Number} ms
 * @return {Notification} for chaining
 * @api public
 */

Notification.prototype.hide = function(ms){
  var self = this;

  // duration
  if ('number' == typeof ms) {
    clearTimeout(this.timer);
    if (!ms) return this;
    this.timer = setTimeout(function(){
      self.hide();
    }, ms);
    return this;
  }

  // hide / remove
  this.el.addClass('hide');
  if (this._effect) {
    setTimeout(function(self){
      self.remove();
    }, 500, this);
  } else {
    self.remove();
  }

  return this;
};

/**
 * Hide the notification without potential animation.
 *
 * @return {Dialog} for chaining
 * @api public
 */

Notification.prototype.remove = function(){
  this.el.remove();
  return this;
};
})(ui, "<li class=\"notification hide\">\n  <div class=\"content\">\n    <h1>Title</h1>\n    <a href=\"#\" class=\"close\">×</a>\n    <p>Message</p>\n  </div>\n</li>");
;(function(exports, html){

/**
 * Expose `ContextMenu`.
 */

exports.ContextMenu = ContextMenu;

/**
 * Create a new `ContextMenu`.
 *
 * @return {ContextMenu}
 * @api public
 */

exports.menu = function(){
  return new ContextMenu;
};

/**
 * Initialize a new `ContextMenu` with content
 * for face `front` and `back`.
 *
 * Emits "flip" event.
 *
 * @param {Mixed} front
 * @param {Mixed} back
 * @api public
 */

function ContextMenu(front, back) {
  var self = this;
  ui.Emitter.call(this);
  this.items = {};
  this.el = $(html).appendTo('body');
  $('html').click(function(){
    self.hide();
  });
};

/**
 * Inherit from `Emitter.prototype`.
 */

ContextMenu.prototype = new ui.Emitter;

/**
 * Add menu item with the given `text` and callback `fn`.
 *
 * When the item is clicked `fn()` will be invoked
 * and the `ContextMenu` is immediately closed. 
 *
 * @param {String} text
 * @param {Function} fn
 * @return {ContextMenu}
 * @api public
 */

ContextMenu.prototype.add = function(text, fn){
  if (1 == arguments.length) return this.items[text];
  var self = this
    , el = $('<li><a href="#">' + text + '</a></li>')
    .addClass(slug(text))
    .appendTo(this.el)
    .click(function(e){
      e.preventDefault();
      e.stopPropagation();
      self.hide();
      fn();
    });

  this.items[text] = el;
  return this;
};

/**
 * Remove menu item with the given `text`.
 *
 * @param {String} text
 * @return {ContextMenu}
 * @api public
 */

ContextMenu.prototype.remove = function(text){
  var item = this.items[text];
  if (!item) throw new Error('no menu item named "' + text + '"');
  item.remove();
  delete this.items[text];
  return this;
};

/**
 * Check if this menu has an item with the given `text`.
 *
 * @param {String} text
 * @return {Boolean}
 * @api public
 */

ContextMenu.prototype.has = function(text){
  return !! this.items[text];
};

/**
 * Move context menu to `(x, y)`.
 *
 * @param {Number} x
 * @param {Number} y
 * @return {ContextMenu}
 * @api public
 */

ContextMenu.prototype.moveTo = function(x, y){
  this.el.css({
    top: y,
    left: x
  });
  return this;
};

/**
 * Show the menu.
 *
 * @return {ContextMenu}
 * @api public
 */

ContextMenu.prototype.show = function(){
  this.emit('show');
  this.el.show();
  return this;
};

/**
 * Hide the menu.
 *
 * @return {ContextMenu}
 * @api public
 */

ContextMenu.prototype.hide = function(){
  this.emit('hide');
  this.el.hide();
  return this;
};

/**
 * Generate a slug from `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function slug(str) {
  return str
    .toLowerCase()
    .replace(/ +/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

})(ui, "<div id=\"context-menu\">\n</div>");
;(function(exports, html){

/**
 * Expose `Card`.
 */

exports.Card = Card;

/**
 * Create a new `Card`.
 *
 * @param {Mixed} front
 * @param {Mixed} back
 * @return {Card}
 * @api public
 */

exports.card = function(front, back){
  return new Card(front, back);
};

/**
 * Initialize a new `Card` with content
 * for face `front` and `back`.
 *
 * Emits "flip" event.
 *
 * @param {Mixed} front
 * @param {Mixed} back
 * @api public
 */

function Card(front, back) {
  ui.Emitter.call(this);
  this._front = front || $('<p>front</p>');
  this._back = back  || $('<p>back</p>');
  this.template = html;
  this.render();
};

/**
 * Inherit from `Emitter.prototype`.
 */

Card.prototype = new ui.Emitter;

/**
 * Set front face `val`.
 *
 * @param {Mixed} val
 * @return {Card}
 * @api public
 */

Card.prototype.front = function(val){
  this._front = val;
  this.render();
  return this;
};

/**
 * Set back face `val`.
 *
 * @param {Mixed} val
 * @return {Card}
 * @api public
 */

Card.prototype.back = function(val){
  this._back = val;
  this.render();
  return this;
};

/**
 * Flip the card.
 *
 * @return {Card} for chaining
 * @api public
 */

Card.prototype.flip = function(){
  this.emit('flip');
  this.el.toggleClass('flipped');
  return this;
};

/**
 * Set the effect to `type`.
 *
 * @param {String} type
 * @return {Dialog} for chaining
 * @api public
 */

Card.prototype.effect = function(type){
  this.el.addClass(type);
  return this;
};

/**
 * Render with the given `options`.
 *
 * @param {Object} options
 * @api public
 */

Card.prototype.render = function(options){
  var self = this
    , el = this.el = $(this.template);
  el.find('.front').empty().append(this._front.el || $(this._front));
  el.find('.back').empty().append(this._back.el || $(this._back));
  el.click(function(){
    self.flip();
  });
};
})(ui, "<div class=\"card\">\n  <div class=\"wrapper\">\n    <div class=\"face front\">1</div>\n    <div class=\"face back\">2</div>\n  </div>\n</div>");
});

require.define("/controllers/annotare.js", function (require, module, exports, __dirname, __filename) {
(function() {
  var $, Flakey, Main, settings;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Flakey = require('flakey');

  $ = Flakey.$;

  settings = require('../settings');

  Main = (function() {

    __extends(Main, Flakey.controllers.Stack);

    function Main(config) {
      this.server_offline = __bind(this.server_offline, this);
      this.server_online = __bind(this.server_online, this);
      this.check_heartbeat = __bind(this.check_heartbeat, this);
      var Detail, Edit, History, List, NewDocument;
      NewDocument = require('./new_document');
      List = require('./list');
      Detail = require('./detail');
      Edit = require('./edit');
      History = require('./history');
      this.id = 'main-stack';
      this.class_name = 'stack';
      this.controllers = {
        new_document: NewDocument,
        list: List,
        detail: Detail,
        edit: Edit,
        history: History
      };
      this.routes = {
        '^/new$': 'new_document',
        '^/list$': 'list',
        '^/detail$': 'detail',
        '^/edit$': 'edit',
        '^/history$': 'history'
      };
      this["default"] = '/list';
      this.status = true;
      this.sync_models();
      this.check_heartbeat();
      Main.__super__.constructor.call(this, config);
    }

    Main.prototype.check_heartbeat = function() {
      var interval;
      var _this = this;
      interval = 5000;
      return $.ajax({
        url: '/api/heartbeat/',
        success: function(data) {
          _this.server_online();
          return setTimeout(_this.check_heartbeat, interval);
        },
        error: function(data) {
          _this.server_offline();
          return setTimeout(_this.check_heartbeat, interval);
        }
      });
    };

    Main.prototype.server_online = function() {
      if (!this.status) this.sync_models();
      this.status = true;
      Flakey.events.trigger(settings.signals.online, settings.signals.namespace);
      return $('#server_status').removeClass('offline').addClass('online').html('Server Online');
    };

    Main.prototype.server_offline = function() {
      this.status = false;
      Flakey.events.trigger(settings.signals.offline, settings.signals.namespace);
      return $('#server_status').removeClass('online').addClass('offline').html('Server Offline');
    };

    Main.prototype.sync_models = function() {
      Flakey.models.backend_controller.sync('Document');
      return Flakey.models.backend_controller.sync('Annotation');
    };

    return Main;

  })();

  module.exports = Main;

}).call(this);

});

require.define("/settings.js", function (require, module, exports, __dirname, __filename) {

  module.exports = {
    growl_hide_after: 5000,
    growl_effect: 'slide',
    signals: {
      namespace: 'annotare',
      online: 'server_online',
      offline: 'server_offline'
    }
  };

});

require.define("/controllers/new_document.js", function (require, module, exports, __dirname, __filename) {
(function() {
  var $, Document, Flakey, NewDocument, autoresize, settings, ui;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Flakey = require('flakey');

  $ = Flakey.$;

  autoresize = require('../lib/autoresize');

  ui = require('../lib/uikit');

  settings = require('../settings');

  Document = require('../models/Document');

  NewDocument = (function() {

    __extends(NewDocument, Flakey.controllers.Controller);

    function NewDocument(config) {
      this.discard = __bind(this.discard, this);
      this.save = __bind(this.save, this);      this.id = "new-document-view";
      this.class_name = "new_document view";
      this.actions = {
        'click .new.save': 'save',
        'click .new.discard': 'discard',
        'keyup esc #new-editor': 'discard',
        'keyup esc': 'discard',
        'keyup ctrl+s #new-editor': 'save',
        'keyup ctrl+s': 'save'
      };
      NewDocument.__super__.constructor.call(this, config);
      this.tmpl = Flakey.templates.get_template('new_document', require('../views/new_document'));
    }

    NewDocument.prototype.render = function() {
      this.html(this.tmpl.render({
        title: this.query_params.title
      }));
      this.unbind_actions();
      this.bind_actions();
      $('#new-editor').autoResize({
        extraSpace: 100,
        maxHeight: 2000
      });
      $('#new-editor').blur();
      return $('#name').focus();
    };

    NewDocument.prototype.save = function(event) {
      var doc, name, text;
      event.preventDefault();
      name = $('#name').val();
      text = $('#new-editor').val();
      if (name.length > 0 && text.length > 0) {
        doc = new Document({
          name: name,
          base_text: text
        });
        doc.generate_slug();
        doc.save();
        ui.info('Everything\'s Shiny Capt\'n!', "\"" + doc.name + "\" was successfully saved.").hide(settings.growl_hide_after).effect(settings.growl_effect);
        return window.location.hash = "#/detail?" + Flakey.util.querystring.build({
          id: doc.id
        });
      }
    };

    NewDocument.prototype.discard = function(event) {
      event.preventDefault();
      return ui.confirm('There be Monsters!', 'Careful there Captain; are you sure you want to discard this document?').show(function(ok) {
        if (ok) return window.location.hash = "#/list";
      });
    };

    return NewDocument;

  })();

  module.exports = NewDocument;

}).call(this);

});

require.define("/lib/autoresize.js", function (require, module, exports, __dirname, __filename) {
/*
 * jQuery.fn.autoResize 1.14
 * --
 * https://github.com/jamespadolsey/jQuery.fn.autoResize
 * --
 * This program is free software. It comes without any warranty, to
 * the extent permitted by applicable law. You can redistribute it
 * and/or modify it under the terms of the Do What The Fuck You Want
 * To Public License, Version 2, as published by Sam Hocevar. See
 * http://sam.zoy.org/wtfpl/COPYING for more details. */ 

(function($){

	var uid = 'ar' + +new Date,

		defaults = autoResize.defaults = {
			onResize: function(){},
			onBeforeResize: function(){return 123},
			onAfterResize: function(){return 555},
			animate: {
				duration: 200,
				complete: function(){}
			},
			extraSpace: 50,
			minHeight: 'original',
			maxHeight: 500,
			minWidth: 'original',
			maxWidth: 500
		};

	autoResize.cloneCSSProperties = [
		'lineHeight', 'textDecoration', 'letterSpacing',
		'fontSize', 'fontFamily', 'fontStyle', 'fontWeight',
		'textTransform', 'textAlign', 'direction', 'wordSpacing', 'fontSizeAdjust',
		'paddingTop', 'paddingLeft', 'paddingBottom', 'paddingRight', 'width'
	];

	autoResize.cloneCSSValues = {
		position: 'absolute',
		top: -9999,
		left: -9999,
		opacity: 0,
		overflow: 'hidden'
	};

	autoResize.resizableFilterSelector = [
		'textarea:not(textarea.' + uid + ')',
		'input:not(input[type])',
		'input[type=text]',
		'input[type=password]',
		'input[type=email]',
		'input[type=url]'
	].join(',');

	autoResize.AutoResizer = AutoResizer;

	$.fn.autoResize = autoResize;

	function autoResize(config) {
		this.filter(autoResize.resizableFilterSelector).each(function(){
			new AutoResizer( $(this), config );
		});
		return this;
	}

	function AutoResizer(el, config) {

		if (el.data('AutoResizer')) {
			el.data('AutoResizer').destroy();
		}
		
		config = this.config = $.extend({}, autoResize.defaults, config);
		this.el = el;

		this.nodeName = el[0].nodeName.toLowerCase();

		this.originalHeight = el.height();
		this.previousScrollTop = null;

		this.value = el.val();

		if (config.maxWidth === 'original') config.maxWidth = el.width();
		if (config.minWidth === 'original') config.minWidth = el.width();
		if (config.maxHeight === 'original') config.maxHeight = el.height();
		if (config.minHeight === 'original') config.minHeight = el.height();

		if (this.nodeName === 'textarea') {
			el.css({
				resize: 'none',
				overflowY: 'hidden'
			});
		}

		el.data('AutoResizer', this);

		// Make sure onAfterResize is called upon animation completion
		config.animate.complete = (function(f){
			return function() {
				config.onAfterResize.call(el);
				return f.apply(this, arguments);
			};
		}(config.animate.complete));

		this.bind();

	}

	AutoResizer.prototype = {

		bind: function() {

			var check = $.proxy(function(){
				this.check();
				return true;
			}, this);

			this.unbind();

			this.el
				.bind('keyup.autoResize', check)
				//.bind('keydown.autoResize', check)
				.bind('change.autoResize', check)
				.bind('paste.autoResize', function() {
					setTimeout(function() { check(); }, 0);
				});
			
			if (!this.el.is(':hidden')) {
				this.check(null, true);
			}

		},

		unbind: function() {
			this.el.unbind('.autoResize');
		},

		createClone: function() {

			var el = this.el,
				clone = this.nodeName === 'textarea' ? el.clone() : $('<span/>');

			this.clone = clone;

			$.each(autoResize.cloneCSSProperties, function(i, p){
				clone[0].style[p] = el.css(p);
			});

			clone
				.removeAttr('name')
				.removeAttr('id')
				.addClass(uid)
				.attr('tabIndex', -1)
				.css(autoResize.cloneCSSValues);

			if (this.nodeName === 'textarea') {
				clone.height('auto');
			} else {
				clone.width('auto').css({
					whiteSpace: 'nowrap'
				});
			}

		},

		check: function(e, immediate) {

			if (!this.clone) {
		this.createClone();
		this.injectClone();
			}

			var config = this.config,
				clone = this.clone,
				el = this.el,
				value = el.val();

			// Do nothing if value hasn't changed
			if (value === this.prevValue) { return true; }
			this.prevValue = value;

			if (this.nodeName === 'input') {

				clone.text(value);

				// Calculate new width + whether to change
				var cloneWidth = clone.width(),
					newWidth = (cloneWidth + config.extraSpace) >= config.minWidth ?
						cloneWidth + config.extraSpace : config.minWidth,
					currentWidth = el.width();

				newWidth = Math.min(newWidth, config.maxWidth);

				if (
					(newWidth < currentWidth && newWidth >= config.minWidth) ||
					(newWidth >= config.minWidth && newWidth <= config.maxWidth)
				) {

					config.onBeforeResize.call(el);
					config.onResize.call(el);

					el.scrollLeft(0);

					if (config.animate && !immediate) {
						el.stop(1,1).animate({
							width: newWidth
						}, config.animate);
					} else {
						el.width(newWidth);
						config.onAfterResize.call(el);
					}

				}

				return;

			}

			// TEXTAREA
			
			clone.width(el.width()).height(0).val(value).scrollTop(10000);
			
			var scrollTop = clone[0].scrollTop;
				
			// Don't do anything if scrollTop hasen't changed:
			if (this.previousScrollTop === scrollTop) {
				return;
			}

			this.previousScrollTop = scrollTop;
			
			if (scrollTop + config.extraSpace >= config.maxHeight) {
				el.css('overflowY', '');
				scrollTop = config.maxHeight;
				immediate = true;
			} else if (scrollTop <= config.minHeight) {
				scrollTop = config.minHeight;
			} else {
				el.css('overflowY', 'hidden');
				scrollTop += config.extraSpace;
			}

			config.onBeforeResize.call(el);
			config.onResize.call(el);

			// Either animate or directly apply height:
			if (config.animate && !immediate) {
				el.stop(1,1).animate({
					height: scrollTop
				}, config.animate);
			} else {
				el.height(scrollTop);
				config.onAfterResize.call(el);
			}

		},

		destroy: function() {
			this.unbind();
			this.el.removeData('AutoResizer');
			this.clone.remove();
			delete this.el;
			delete this.clone;
		},

		injectClone: function() {
			(
				autoResize.cloneContainer ||
				(autoResize.cloneContainer = $('<arclones/>').appendTo('body'))
			).append(this.clone);
		}

	};
	
})(jQuery);

module.exports = $;
});

require.define("/models/Document.js", function (require, module, exports, __dirname, __filename) {
(function() {
  var Annotation, Document, Flakey, Showdown;
  var __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Flakey = require('flakey');

  Showdown = require('../lib/showdown');

  Annotation = require('./Annotation');

  Document = (function() {

    __extends(Document, Flakey.models.Model);

    function Document() {
      Document.__super__.constructor.apply(this, arguments);
    }

    Document.model_name = 'Document';

    Document.fields = ['id', 'name', 'slug', 'base_text', 'annotations'];

    Document.prototype.annotate = function(selection, html, attachment) {
      var note, type;
      if (attachment === void 0) {
        type = 'highlight';
      } else {
        type = 'note';
      }
      note = new Annotation({
        text: selection,
        type: type,
        attachment: attachment,
        document: this.id
      });
      note.save();
      if (!this.annotations || this.annotations.constructor !== Array) {
        this.annotations = [];
      }
      this.annotations.push(note.id);
      this.save();
      return note.apply(html);
    };

    Document.prototype["delete"] = function() {
      var file, file_id, note, note_id, _i, _j, _len, _len2, _ref, _ref2;
      if (this.annotations != null) {
        _ref = this.annotations;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          note_id = _ref[_i];
          note = Annotation.get(note_id);
          if (note != null) note["delete"]();
        }
      }
      if (this.files != null) {
        _ref2 = this.files;
        for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
          file_id = _ref2[_j];
          file = File.get(file_id);
          if (file != null) file["delete"]();
        }
      }
      return Document.__super__["delete"].call(this);
    };

    Document.prototype.delete_annotation = function(id) {
      var index;
      index = this.annotations.indexOf(id);
      if (index !== -1) {
        this.annotations.splice(index, 1);
        return this.save();
      }
    };

    Document.prototype.draw_annotations = function(html, annotations) {
      var note, note_id, _i, _len;
      if (annotations == null) annotations = this.annotations;
      if (!annotations || annotations.constructor !== Array) annotations = [];
      for (_i = 0, _len = annotations.length; _i < _len; _i++) {
        note_id = annotations[_i];
        note = Annotation.get(note_id);
        if (note != null) html = note.apply(html);
      }
      return html;
    };

    Document.prototype.generate_slug = function() {
      var slug;
      slug = this.name;
      slug = slug.toLowerCase().replace(/[^\_\ 0-9a-z-]/g, "").replace(/[ ]/g, '_');
      this.slug = slug;
      return slug;
    };

    Document.prototype.get_files = function() {
      var file, files, id, _i, _len, _ref;
      if (!this.files || this.files.constructor !== Array) this.files = [];
      files = [];
      _ref = this.files;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        id = _ref[_i];
        file = File.get(id);
        if (file != null) files.push(file);
      }
      return files;
    };

    Document.prototype.get_notes = function() {
      var id, note, notes, _i, _len, _ref;
      if (!this.annotations || this.annotations.constructor !== Array) {
        this.annotations = [];
      }
      notes = [];
      _ref = this.annotations;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        id = _ref[_i];
        note = Annotation.get(id);
        if (note != null) notes.push(note);
      }
      return notes;
    };

    Document.prototype.render = function() {
      var converter, html;
      converter = new Showdown.converter();
      html = converter.makeHtml(this.base_text);
      return html;
    };

    return Document;

  })();

  module.exports = Document;

}).call(this);

});

require.define("/lib/showdown.js", function (require, module, exports, __dirname, __filename) {
var Showdown = (function() {
    //
    // showdown.js -- A javascript port of Markdown.
    //
    // Copyright (c) 2007 John Fraser.
    //
    // Original Markdown Copyright (c) 2004-2005 John Gruber
    //   <http://daringfireball.net/projects/markdown/>
    //
    // Redistributable under a BSD-style open source license.
    // See license.txt for more information.
    //
    // The full source distribution is at:
    //
    //				A A L
    //				T C A
    //				T K B
    //
    //   <http://www.attacklab.net/>
    //

    //
    // Wherever possible, Showdown is a straight, line-by-line port
    // of the Perl version of Markdown.
    //
    // This is not a normal parser design; it's basically just a
    // series of string substitutions.  It's hard to read and
    // maintain this way,  but keeping Showdown close to the original
    // design makes it easier to port new features.
    //
    // More importantly, Showdown behaves like markdown.pl in most
    // edge cases.  So web applications can do client-side preview
    // in Javascript, and then build identical HTML on the server.
    //
    // This port needs the new RegExp functionality of ECMA 262,
    // 3rd Edition (i.e. Javascript 1.5).  Most modern web browsers
    // should do fine.  Even with the new regular expression features,
    // We do a lot of work to emulate Perl's regex functionality.
    // The tricky changes in this file mostly have the "attacklab:"
    // label.  Major or self-explanatory changes don't.
    //
    // Smart diff tools like Araxis Merge will be able to match up
    // this file with markdown.pl in a useful way.  A little tweaking
    // helps: in a copy of markdown.pl, replace "#" with "//" and
    // replace "$text" with "text".  Be sure to ignore whitespace
    // and line endings.
    //


    //
    // Showdown usage:
    //
    //   var text = "Markdown *rocks*.";
    //
    //   var converter = new Showdown.converter();
    //   var html = converter.makeHtml(text);
    //
    //   alert(html);
    //
    // Note: move the sample code to the bottom of this
    // file before uncommenting it.
    //


    //
    // Showdown namespace
    //
    var Showdown = {};

    //
    // converter
    //
    // Wraps all "globals" so that the only thing
    // exposed is makeHtml().
    //
    Showdown.converter = function() {

    //
    // Globals:
    //

    // Global hashes, used by various utility routines
    var g_urls;
    var g_titles;
    var g_html_blocks;

    // Used to track when we're inside an ordered or unordered list
    // (see _ProcessListItems() for details):
    var g_list_level = 0;


    this.makeHtml = function(text) {
    //
    // Main function. The order in which other subs are called here is
    // essential. Link and image substitutions need to happen before
    // _EscapeSpecialCharsWithinTagAttributes(), so that any *'s or _'s in the <a>
    // and <img> tags get encoded.
    //

    	// Clear the global hashes. If we don't clear these, you get conflicts
    	// from other articles when generating a page which contains more than
    	// one article (e.g. an index page that shows the N most recent
    	// articles):
    	g_urls = new Array();
    	g_titles = new Array();
    	g_html_blocks = new Array();

    	// attacklab: Replace ~ with ~T
    	// This lets us use tilde as an escape char to avoid md5 hashes
    	// The choice of character is arbitray; anything that isn't
        // magic in Markdown will work.
    	text = text.replace(/~/g,"~T");

    	// attacklab: Replace $ with ~D
    	// RegExp interprets $ as a special character
    	// when it's in a replacement string
    	text = text.replace(/\$/g,"~D");

    	// Standardize line endings
    	text = text.replace(/\r\n/g,"\n"); // DOS to Unix
    	text = text.replace(/\r/g,"\n"); // Mac to Unix

    	// Make sure text begins and ends with a couple of newlines:
    	text = "\n\n" + text + "\n\n";

    	// Convert all tabs to spaces.
    	text = _Detab(text);

    	// Strip any lines consisting only of spaces and tabs.
    	// This makes subsequent regexen easier to write, because we can
    	// match consecutive blank lines with /\n+/ instead of something
    	// contorted like /[ \t]*\n+/ .
    	text = text.replace(/^[ \t]+$/mg,"");

    	// Turn block-level HTML blocks into hash entries
    	text = _HashHTMLBlocks(text);

    	// Strip link definitions, store in hashes.
    	text = _StripLinkDefinitions(text);

    	text = _RunBlockGamut(text);

    	text = _UnescapeSpecialChars(text);

    	// attacklab: Restore dollar signs
    	text = text.replace(/~D/g,"$$");

    	// attacklab: Restore tildes
    	text = text.replace(/~T/g,"~");

    	return text;
    }


    var _StripLinkDefinitions = function(text) {
    //
    // Strips link definitions from text, stores the URLs and titles in
    // hash references.
    //

    	// Link defs are in the form: ^[id]: url "optional title"

    	/*
    		var text = text.replace(/
    				^[ ]{0,3}\[(.+)\]:  // id = $1  attacklab: g_tab_width - 1
    				  [ \t]*
    				  \n?				// maybe *one* newline
    				  [ \t]*
    				<?(\S+?)>?			// url = $2
    				  [ \t]*
    				  \n?				// maybe one newline
    				  [ \t]*
    				(?:
    				  (\n*)				// any lines skipped = $3 attacklab: lookbehind removed
    				  ["(]
    				  (.+?)				// title = $4
    				  [")]
    				  [ \t]*
    				)?					// title is optional
    				(?:\n+|$)
    			  /gm,
    			  function(){...});
    	*/
    	var text = text.replace(/^[ ]{0,3}\[(.+)\]:[ \t]*\n?[ \t]*<?(\S+?)>?[ \t]*\n?[ \t]*(?:(\n*)["(](.+?)[")][ \t]*)?(?:\n+|\Z)/gm,
    		function (wholeMatch,m1,m2,m3,m4) {
    			m1 = m1.toLowerCase();
    			g_urls[m1] = _EncodeAmpsAndAngles(m2);  // Link IDs are case-insensitive
    			if (m3) {
    				// Oops, found blank lines, so it's not a title.
    				// Put back the parenthetical statement we stole.
    				return m3+m4;
    			} else if (m4) {
    				g_titles[m1] = m4.replace(/"/g,"&quot;");
    			}
			
    			// Completely remove the definition from the text
    			return "";
    		}
    	);

    	return text;
    }


    var _HashHTMLBlocks = function(text) {
    	// attacklab: Double up blank lines to reduce lookaround
    	text = text.replace(/\n/g,"\n\n");

    	// Hashify HTML blocks:
    	// We only want to do this for block-level HTML tags, such as headers,
    	// lists, and tables. That's because we still want to wrap <p>s around
    	// "paragraphs" that are wrapped in non-block-level tags, such as anchors,
    	// phrase emphasis, and spans. The list of tags we're looking for is
    	// hard-coded:
    	var block_tags_a = "p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math|ins|del"
    	var block_tags_b = "p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math"

    	// First, look for nested blocks, e.g.:
    	//   <div>
    	//     <div>
    	//     tags for inner block must be indented.
    	//     </div>
    	//   </div>
    	//
    	// The outermost tags must start at the left margin for this to match, and
    	// the inner nested divs must be indented.
    	// We need to do this before the next, more liberal match, because the next
    	// match will start at the first `<div>` and stop at the first `</div>`.

    	// attacklab: This regex can be expensive when it fails.
    	/*
    		var text = text.replace(/
    		(						// save in $1
    			^					// start of line  (with /m)
    			<($block_tags_a)	// start tag = $2
    			\b					// word break
    								// attacklab: hack around khtml/pcre bug...
    			[^\r]*?\n			// any number of lines, minimally matching
    			</\2>				// the matching end tag
    			[ \t]*				// trailing spaces/tabs
    			(?=\n+)				// followed by a newline
    		)						// attacklab: there are sentinel newlines at end of document
    		/gm,function(){...}};
    	*/
    	text = text.replace(/^(<(p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math|ins|del)\b[^\r]*?\n<\/\2>[ \t]*(?=\n+))/gm,hashElement);

    	//
    	// Now match more liberally, simply from `\n<tag>` to `</tag>\n`
    	//

    	/*
    		var text = text.replace(/
    		(						// save in $1
    			^					// start of line  (with /m)
    			<($block_tags_b)	// start tag = $2
    			\b					// word break
    								// attacklab: hack around khtml/pcre bug...
    			[^\r]*?				// any number of lines, minimally matching
    			.*</\2>				// the matching end tag
    			[ \t]*				// trailing spaces/tabs
    			(?=\n+)				// followed by a newline
    		)						// attacklab: there are sentinel newlines at end of document
    		/gm,function(){...}};
    	*/
    	text = text.replace(/^(<(p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math)\b[^\r]*?.*<\/\2>[ \t]*(?=\n+)\n)/gm,hashElement);

    	// Special case just for <hr />. It was easier to make a special case than
    	// to make the other regex more complicated.  

    	/*
    		text = text.replace(/
    		(						// save in $1
    			\n\n				// Starting after a blank line
    			[ ]{0,3}
    			(<(hr)				// start tag = $2
    			\b					// word break
    			([^<>])*?			// 
    			\/?>)				// the matching end tag
    			[ \t]*
    			(?=\n{2,})			// followed by a blank line
    		)
    		/g,hashElement);
    	*/
    	text = text.replace(/(\n[ ]{0,3}(<(hr)\b([^<>])*?\/?>)[ \t]*(?=\n{2,}))/g,hashElement);

    	// Special case for standalone HTML comments:

    	/*
    		text = text.replace(/
    		(						// save in $1
    			\n\n				// Starting after a blank line
    			[ ]{0,3}			// attacklab: g_tab_width - 1
    			<!
    			(--[^\r]*?--\s*)+
    			>
    			[ \t]*
    			(?=\n{2,})			// followed by a blank line
    		)
    		/g,hashElement);
    	*/
    	text = text.replace(/(\n\n[ ]{0,3}<!(--[^\r]*?--\s*)+>[ \t]*(?=\n{2,}))/g,hashElement);

    	// PHP and ASP-style processor instructions (<?...?> and <%...%>)

    	/*
    		text = text.replace(/
    		(?:
    			\n\n				// Starting after a blank line
    		)
    		(						// save in $1
    			[ ]{0,3}			// attacklab: g_tab_width - 1
    			(?:
    				<([?%])			// $2
    				[^\r]*?
    				\2>
    			)
    			[ \t]*
    			(?=\n{2,})			// followed by a blank line
    		)
    		/g,hashElement);
    	*/
    	text = text.replace(/(?:\n\n)([ ]{0,3}(?:<([?%])[^\r]*?\2>)[ \t]*(?=\n{2,}))/g,hashElement);

    	// attacklab: Undo double lines (see comment at top of this function)
    	text = text.replace(/\n\n/g,"\n");
    	return text;
    }

    var hashElement = function(wholeMatch,m1) {
    	var blockText = m1;

    	// Undo double lines
    	blockText = blockText.replace(/\n\n/g,"\n");
    	blockText = blockText.replace(/^\n/,"");
	
    	// strip trailing blank lines
    	blockText = blockText.replace(/\n+$/g,"");
	
    	// Replace the element text with a marker ("~KxK" where x is its key)
    	blockText = "\n\n~K" + (g_html_blocks.push(blockText)-1) + "K\n\n";
	
    	return blockText;
    };

    var _RunBlockGamut = function(text) {
    //
    // These are all the transformations that form block-level
    // tags like paragraphs, headers, and list items.
    //
    	text = _DoHeaders(text);

    	// Do Horizontal Rules:
    	var key = hashBlock("<hr />");
    	text = text.replace(/^[ ]{0,2}([ ]?\*[ ]?){3,}[ \t]*$/gm,key);
    	text = text.replace(/^[ ]{0,2}([ ]?\-[ ]?){3,}[ \t]*$/gm,key);
    	text = text.replace(/^[ ]{0,2}([ ]?\_[ ]?){3,}[ \t]*$/gm,key);

    	text = _DoLists(text);
    	text = _DoCodeBlocks(text);
    	text = _DoBlockQuotes(text);

    	// We already ran _HashHTMLBlocks() before, in Markdown(), but that
    	// was to escape raw HTML in the original Markdown source. This time,
    	// we're escaping the markup we've just created, so that we don't wrap
    	// <p> tags around block-level tags.
    	text = _HashHTMLBlocks(text);
    	text = _FormParagraphs(text);

    	return text;
    }


    var _RunSpanGamut = function(text) {
    //
    // These are all the transformations that occur *within* block-level
    // tags like paragraphs, headers, and list items.
    //

    	text = _DoCodeSpans(text);
    	text = _EscapeSpecialCharsWithinTagAttributes(text);
    	text = _EncodeBackslashEscapes(text);

    	// Process anchor and image tags. Images must come first,
    	// because ![foo][f] looks like an anchor.
    	text = _DoImages(text);
    	text = _DoAnchors(text);

    	// Make links out of things like `<http://example.com/>`
    	// Must come after _DoAnchors(), because you can use < and >
    	// delimiters in inline links like [this](<url>).
    	text = _DoAutoLinks(text);
    	text = _EncodeAmpsAndAngles(text);
    	text = _DoItalicsAndBold(text);

    	// Do hard breaks:
    	text = text.replace(/  +\n/g," <br />\n");

    	return text;
    }

    var _EscapeSpecialCharsWithinTagAttributes = function(text) {
    //
    // Within tags -- meaning between < and > -- encode [\ ` * _] so they
    // don't conflict with their use in Markdown for code, italics and strong.
    //

    	// Build a regex to find HTML tags and comments.  See Friedl's 
    	// "Mastering Regular Expressions", 2nd Ed., pp. 200-201.
    	var regex = /(<[a-z\/!$]("[^"]*"|'[^']*'|[^'">])*>|<!(--.*?--\s*)+>)/gi;

    	text = text.replace(regex, function(wholeMatch) {
    		var tag = wholeMatch.replace(/(.)<\/?code>(?=.)/g,"$1`");
    		tag = escapeCharacters(tag,"\\`*_");
    		return tag;
    	});

    	return text;
    }

    var _DoAnchors = function(text) {
    //
    // Turn Markdown link shortcuts into XHTML <a> tags.
    //
    	//
    	// First, handle reference-style links: [link text] [id]
    	//

    	/*
    		text = text.replace(/
    		(							// wrap whole match in $1
    			\[
    			(
    				(?:
    					\[[^\]]*\]		// allow brackets nested one level
    					|
    					[^\[]			// or anything else
    				)*
    			)
    			\]

    			[ ]?					// one optional space
    			(?:\n[ ]*)?				// one optional newline followed by spaces

    			\[
    			(.*?)					// id = $3
    			\]
    		)()()()()					// pad remaining backreferences
    		/g,_DoAnchors_callback);
    	*/
    	text = text.replace(/(\[((?:\[[^\]]*\]|[^\[\]])*)\][ ]?(?:\n[ ]*)?\[(.*?)\])()()()()/g,writeAnchorTag);

    	//
    	// Next, inline-style links: [link text](url "optional title")
    	//

    	/*
    		text = text.replace(/
    			(						// wrap whole match in $1
    				\[
    				(
    					(?:
    						\[[^\]]*\]	// allow brackets nested one level
    					|
    					[^\[\]]			// or anything else
    				)
    			)
    			\]
    			\(						// literal paren
    			[ \t]*
    			()						// no id, so leave $3 empty
    			<?(.*?)>?				// href = $4
    			[ \t]*
    			(						// $5
    				(['"])				// quote char = $6
    				(.*?)				// Title = $7
    				\6					// matching quote
    				[ \t]*				// ignore any spaces/tabs between closing quote and )
    			)?						// title is optional
    			\)
    		)
    		/g,writeAnchorTag);
    	*/
    	text = text.replace(/(\[((?:\[[^\]]*\]|[^\[\]])*)\]\([ \t]*()<?(.*?)>?[ \t]*((['"])(.*?)\6[ \t]*)?\))/g,writeAnchorTag);

    	//
    	// Last, handle reference-style shortcuts: [link text]
    	// These must come last in case you've also got [link test][1]
    	// or [link test](/foo)
    	//

    	/*
    		text = text.replace(/
    		(		 					// wrap whole match in $1
    			\[
    			([^\[\]]+)				// link text = $2; can't contain '[' or ']'
    			\]
    		)()()()()()					// pad rest of backreferences
    		/g, writeAnchorTag);
    	*/
    	text = text.replace(/(\[([^\[\]]+)\])()()()()()/g, writeAnchorTag);

    	return text;
    }

    var writeAnchorTag = function(wholeMatch,m1,m2,m3,m4,m5,m6,m7) {
    	if (m7 == undefined) m7 = "";
    	var whole_match = m1;
    	var link_text   = m2;
    	var link_id	 = m3.toLowerCase();
    	var url		= m4;
    	var title	= m7;
	
    	if (url == "") {
    		if (link_id == "") {
    			// lower-case and turn embedded newlines into spaces
    			link_id = link_text.toLowerCase().replace(/ ?\n/g," ");
    		}
    		url = "#"+link_id;
		
    		if (g_urls[link_id] != undefined) {
    			url = g_urls[link_id];
    			if (g_titles[link_id] != undefined) {
    				title = g_titles[link_id];
    			}
    		}
    		else {
    			if (whole_match.search(/\(\s*\)$/m)>-1) {
    				// Special case for explicit empty url
    				url = "";
    			} else {
    				return whole_match;
    			}
    		}
    	}	
	
    	url = escapeCharacters(url,"*_");
    	var result = "<a href=\"" + url + "\"";
	
    	if (title != "") {
    		title = title.replace(/"/g,"&quot;");
    		title = escapeCharacters(title,"*_");
    		result +=  " title=\"" + title + "\"";
    	}
	
    	result += ">" + link_text + "</a>";
	
    	return result;
    }


    var _DoImages = function(text) {
    //
    // Turn Markdown image shortcuts into <img> tags.
    //

    	//
    	// First, handle reference-style labeled images: ![alt text][id]
    	//

    	/*
    		text = text.replace(/
    		(						// wrap whole match in $1
    			!\[
    			(.*?)				// alt text = $2
    			\]

    			[ ]?				// one optional space
    			(?:\n[ ]*)?			// one optional newline followed by spaces

    			\[
    			(.*?)				// id = $3
    			\]
    		)()()()()				// pad rest of backreferences
    		/g,writeImageTag);
    	*/
    	text = text.replace(/(!\[(.*?)\][ ]?(?:\n[ ]*)?\[(.*?)\])()()()()/g,writeImageTag);

    	//
    	// Next, handle inline images:  ![alt text](url "optional title")
    	// Don't forget: encode * and _

    	/*
    		text = text.replace(/
    		(						// wrap whole match in $1
    			!\[
    			(.*?)				// alt text = $2
    			\]
    			\s?					// One optional whitespace character
    			\(					// literal paren
    			[ \t]*
    			()					// no id, so leave $3 empty
    			<?(\S+?)>?			// src url = $4
    			[ \t]*
    			(					// $5
    				(['"])			// quote char = $6
    				(.*?)			// title = $7
    				\6				// matching quote
    				[ \t]*
    			)?					// title is optional
    		\)
    		)
    		/g,writeImageTag);
    	*/
    	text = text.replace(/(!\[(.*?)\]\s?\([ \t]*()<?(\S+?)>?[ \t]*((['"])(.*?)\6[ \t]*)?\))/g,writeImageTag);

    	return text;
    }

    var writeImageTag = function(wholeMatch,m1,m2,m3,m4,m5,m6,m7) {
    	var whole_match = m1;
    	var alt_text   = m2;
    	var link_id	 = m3.toLowerCase();
    	var url		= m4;
    	var title	= m7;

    	if (!title) title = "";
	
    	if (url == "") {
    		if (link_id == "") {
    			// lower-case and turn embedded newlines into spaces
    			link_id = alt_text.toLowerCase().replace(/ ?\n/g," ");
    		}
    		url = "#"+link_id;
		
    		if (g_urls[link_id] != undefined) {
    			url = g_urls[link_id];
    			if (g_titles[link_id] != undefined) {
    				title = g_titles[link_id];
    			}
    		}
    		else {
    			return whole_match;
    		}
    	}	
	
    	alt_text = alt_text.replace(/"/g,"&quot;");
    	url = escapeCharacters(url,"*_");
    	var result = "<img src=\"" + url + "\" alt=\"" + alt_text + "\"";

    	// attacklab: Markdown.pl adds empty title attributes to images.
    	// Replicate this bug.

    	//if (title != "") {
    		title = title.replace(/"/g,"&quot;");
    		title = escapeCharacters(title,"*_");
    		result +=  " title=\"" + title + "\"";
    	//}
	
    	result += " />";
	
    	return result;
    }


    var _DoHeaders = function(text) {

    	// Setext-style headers:
    	//	Header 1
    	//	========
    	//  
    	//	Header 2
    	//	--------
    	//
    	text = text.replace(/^(.+)[ \t]*\n=+[ \t]*\n+/gm,
    		function(wholeMatch,m1){return hashBlock("<h1>" + _RunSpanGamut(m1) + "</h1>");});

    	text = text.replace(/^(.+)[ \t]*\n-+[ \t]*\n+/gm,
    		function(matchFound,m1){return hashBlock("<h2>" + _RunSpanGamut(m1) + "</h2>");});

    	// atx-style headers:
    	//  # Header 1
    	//  ## Header 2
    	//  ## Header 2 with closing hashes ##
    	//  ...
    	//  ###### Header 6
    	//

    	/*
    		text = text.replace(/
    			^(\#{1,6})				// $1 = string of #'s
    			[ \t]*
    			(.+?)					// $2 = Header text
    			[ \t]*
    			\#*						// optional closing #'s (not counted)
    			\n+
    		/gm, function() {...});
    	*/

    	text = text.replace(/^(\#{1,6})[ \t]*(.+?)[ \t]*\#*\n+/gm,
    		function(wholeMatch,m1,m2) {
    			var h_level = m1.length;
    			return hashBlock("<h" + h_level + ">" + _RunSpanGamut(m2) + "</h" + h_level + ">");
    		});

    	return text;
    }

    // This declaration keeps Dojo compressor from outputting garbage:
    var _ProcessListItems;

    var _DoLists = function(text) {
    //
    // Form HTML ordered (numbered) and unordered (bulleted) lists.
    //

    	// attacklab: add sentinel to hack around khtml/safari bug:
    	// http://bugs.webkit.org/show_bug.cgi?id=11231
    	text += "~0";

    	// Re-usable pattern to match any entirel ul or ol list:

    	/*
    		var whole_list = /
    		(									// $1 = whole list
    			(								// $2
    				[ ]{0,3}					// attacklab: g_tab_width - 1
    				([*+-]|\d+[.])				// $3 = first list item marker
    				[ \t]+
    			)
    			[^\r]+?
    			(								// $4
    				~0							// sentinel for workaround; should be $
    			|
    				\n{2,}
    				(?=\S)
    				(?!							// Negative lookahead for another list item marker
    					[ \t]*
    					(?:[*+-]|\d+[.])[ \t]+
    				)
    			)
    		)/g
    	*/
    	var whole_list = /^(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm;

    	if (g_list_level) {
    		text = text.replace(whole_list,function(wholeMatch,m1,m2) {
    			var list = m1;
    			var list_type = (m2.search(/[*+-]/g)>-1) ? "ul" : "ol";

    			// Turn double returns into triple returns, so that we can make a
    			// paragraph for the last item in a list, if necessary:
    			list = list.replace(/\n{2,}/g,"\n\n\n");;
    			var result = _ProcessListItems(list);
	
    			// Trim any trailing whitespace, to put the closing `</$list_type>`
    			// up on the preceding line, to get it past the current stupid
    			// HTML block parser. This is a hack to work around the terrible
    			// hack that is the HTML block parser.
    			result = result.replace(/\s+$/,"");
    			result = "<"+list_type+">" + result + "</"+list_type+">\n";
    			return result;
    		});
    	} else {
    		whole_list = /(\n\n|^\n?)(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/g;
    		text = text.replace(whole_list,function(wholeMatch,m1,m2,m3) {
    			var runup = m1;
    			var list = m2;

    			var list_type = (m3.search(/[*+-]/g)>-1) ? "ul" : "ol";
    			// Turn double returns into triple returns, so that we can make a
    			// paragraph for the last item in a list, if necessary:
    			var list = list.replace(/\n{2,}/g,"\n\n\n");;
    			var result = _ProcessListItems(list);
    			result = runup + "<"+list_type+">\n" + result + "</"+list_type+">\n";	
    			return result;
    		});
    	}

    	// attacklab: strip sentinel
    	text = text.replace(/~0/,"");

    	return text;
    }

    _ProcessListItems = function(list_str) {
    //
    //  Process the contents of a single ordered or unordered list, splitting it
    //  into individual list items.
    //
    	// The $g_list_level global keeps track of when we're inside a list.
    	// Each time we enter a list, we increment it; when we leave a list,
    	// we decrement. If it's zero, we're not in a list anymore.
    	//
    	// We do this because when we're not inside a list, we want to treat
    	// something like this:
    	//
    	//    I recommend upgrading to version
    	//    8. Oops, now this line is treated
    	//    as a sub-list.
    	//
    	// As a single paragraph, despite the fact that the second line starts
    	// with a digit-period-space sequence.
    	//
    	// Whereas when we're inside a list (or sub-list), that line will be
    	// treated as the start of a sub-list. What a kludge, huh? This is
    	// an aspect of Markdown's syntax that's hard to parse perfectly
    	// without resorting to mind-reading. Perhaps the solution is to
    	// change the syntax rules such that sub-lists must start with a
    	// starting cardinal number; e.g. "1." or "a.".

    	g_list_level++;

    	// trim trailing blank lines:
    	list_str = list_str.replace(/\n{2,}$/,"\n");

    	// attacklab: add sentinel to emulate \z
    	list_str += "~0";

    	/*
    		list_str = list_str.replace(/
    			(\n)?							// leading line = $1
    			(^[ \t]*)						// leading whitespace = $2
    			([*+-]|\d+[.]) [ \t]+			// list marker = $3
    			([^\r]+?						// list item text   = $4
    			(\n{1,2}))
    			(?= \n* (~0 | \2 ([*+-]|\d+[.]) [ \t]+))
    		/gm, function(){...});
    	*/
    	list_str = list_str.replace(/(\n)?(^[ \t]*)([*+-]|\d+[.])[ \t]+([^\r]+?(\n{1,2}))(?=\n*(~0|\2([*+-]|\d+[.])[ \t]+))/gm,
    		function(wholeMatch,m1,m2,m3,m4){
    			var item = m4;
    			var leading_line = m1;
    			var leading_space = m2;

    			if (leading_line || (item.search(/\n{2,}/)>-1)) {
    				item = _RunBlockGamut(_Outdent(item));
    			}
    			else {
    				// Recursion for sub-lists:
    				item = _DoLists(_Outdent(item));
    				item = item.replace(/\n$/,""); // chomp(item)
    				item = _RunSpanGamut(item);
    			}

    			return  "<li>" + item + "</li>\n";
    		}
    	);

    	// attacklab: strip sentinel
    	list_str = list_str.replace(/~0/g,"");

    	g_list_level--;
    	return list_str;
    }


    var _DoCodeBlocks = function(text) {
    //
    //  Process Markdown `<pre><code>` blocks.
    //  

    	/*
    		text = text.replace(text,
    			/(?:\n\n|^)
    			(								// $1 = the code block -- one or more lines, starting with a space/tab
    				(?:
    					(?:[ ]{4}|\t)			// Lines must start with a tab or a tab-width of spaces - attacklab: g_tab_width
    					.*\n+
    				)+
    			)
    			(\n*[ ]{0,3}[^ \t\n]|(?=~0))	// attacklab: g_tab_width
    		/g,function(){...});
    	*/

    	// attacklab: sentinel workarounds for lack of \A and \Z, safari\khtml bug
    	text += "~0";
	
    	text = text.replace(/(?:\n\n|^)((?:(?:[ ]{4}|\t).*\n+)+)(\n*[ ]{0,3}[^ \t\n]|(?=~0))/g,
    		function(wholeMatch,m1,m2) {
    			var codeblock = m1;
    			var nextChar = m2;
		
    			codeblock = _EncodeCode( _Outdent(codeblock));
    			codeblock = _Detab(codeblock);
    			codeblock = codeblock.replace(/^\n+/g,""); // trim leading newlines
    			codeblock = codeblock.replace(/\n+$/g,""); // trim trailing whitespace

    			codeblock = "<pre><code>" + codeblock + "\n</code></pre>";

    			return hashBlock(codeblock) + nextChar;
    		}
    	);

    	// attacklab: strip sentinel
    	text = text.replace(/~0/,"");

    	return text;
    }

    var hashBlock = function(text) {
    	text = text.replace(/(^\n+|\n+$)/g,"");
    	return "\n\n~K" + (g_html_blocks.push(text)-1) + "K\n\n";
    }


    var _DoCodeSpans = function(text) {
    //
    //   *  Backtick quotes are used for <code></code> spans.
    // 
    //   *  You can use multiple backticks as the delimiters if you want to
    //	 include literal backticks in the code span. So, this input:
    //	 
    //		 Just type ``foo `bar` baz`` at the prompt.
    //	 
    //	   Will translate to:
    //	 
    //		 <p>Just type <code>foo `bar` baz</code> at the prompt.</p>
    //	 
    //	There's no arbitrary limit to the number of backticks you
    //	can use as delimters. If you need three consecutive backticks
    //	in your code, use four for delimiters, etc.
    //
    //  *  You can use spaces to get literal backticks at the edges:
    //	 
    //		 ... type `` `bar` `` ...
    //	 
    //	   Turns to:
    //	 
    //		 ... type <code>`bar`</code> ...
    //

    	/*
    		text = text.replace(/
    			(^|[^\\])					// Character before opening ` can't be a backslash
    			(`+)						// $2 = Opening run of `
    			(							// $3 = The code block
    				[^\r]*?
    				[^`]					// attacklab: work around lack of lookbehind
    			)
    			\2							// Matching closer
    			(?!`)
    		/gm, function(){...});
    	*/

    	text = text.replace(/(^|[^\\])(`+)([^\r]*?[^`])\2(?!`)/gm,
    		function(wholeMatch,m1,m2,m3,m4) {
    			var c = m3;
    			c = c.replace(/^([ \t]*)/g,"");	// leading whitespace
    			c = c.replace(/[ \t]*$/g,"");	// trailing whitespace
    			c = _EncodeCode(c);
    			return m1+"<code>"+c+"</code>";
    		});

    	return text;
    }


    var _EncodeCode = function(text) {
    //
    // Encode/escape certain characters inside Markdown code runs.
    // The point is that in code, these characters are literals,
    // and lose their special Markdown meanings.
    //
    	// Encode all ampersands; HTML entities are not
    	// entities within a Markdown code span.
    	text = text.replace(/&/g,"&amp;");

    	// Do the angle bracket song and dance:
    	text = text.replace(/</g,"&lt;");
    	text = text.replace(/>/g,"&gt;");

    	// Now, escape characters that are magic in Markdown:
    	text = escapeCharacters(text,"\*_{}[]\\",false);

    // jj the line above breaks this:
    //---

    //* Item

    //   1. Subitem

    //            special char: *
    //---

    	return text;
    }


    var _DoItalicsAndBold = function(text) {

    	// <strong> must go first:
    	text = text.replace(/(\*\*|__)(?=\S)([^\r]*?\S[*_]*)\1/g,
    		"<strong>$2</strong>");

    	text = text.replace(/(\*|_)(?=\S)([^\r]*?\S)\1/g,
    		"<em>$2</em>");

    	return text;
    }


    var _DoBlockQuotes = function(text) {

    	/*
    		text = text.replace(/
    		(								// Wrap whole match in $1
    			(
    				^[ \t]*>[ \t]?			// '>' at the start of a line
    				.+\n					// rest of the first line
    				(.+\n)*					// subsequent consecutive lines
    				\n*						// blanks
    			)+
    		)
    		/gm, function(){...});
    	*/

    	text = text.replace(/((^[ \t]*>[ \t]?.+\n(.+\n)*\n*)+)/gm,
    		function(wholeMatch,m1) {
    			var bq = m1;

    			// attacklab: hack around Konqueror 3.5.4 bug:
    			// "----------bug".replace(/^-/g,"") == "bug"

    			bq = bq.replace(/^[ \t]*>[ \t]?/gm,"~0");	// trim one level of quoting

    			// attacklab: clean up hack
    			bq = bq.replace(/~0/g,"");

    			bq = bq.replace(/^[ \t]+$/gm,"");		// trim whitespace-only lines
    			bq = _RunBlockGamut(bq);				// recurse
			
    			bq = bq.replace(/(^|\n)/g,"$1  ");
    			// These leading spaces screw with <pre> content, so we need to fix that:
    			bq = bq.replace(
    					/(\s*<pre>[^\r]+?<\/pre>)/gm,
    				function(wholeMatch,m1) {
    					var pre = m1;
    					// attacklab: hack around Konqueror 3.5.4 bug:
    					pre = pre.replace(/^  /mg,"~0");
    					pre = pre.replace(/~0/g,"");
    					return pre;
    				});
			
    			return hashBlock("<blockquote>\n" + bq + "\n</blockquote>");
    		});
    	return text;
    }


    var _FormParagraphs = function(text) {
    //
    //  Params:
    //    $text - string to process with html <p> tags
    //

    	// Strip leading and trailing lines:
    	text = text.replace(/^\n+/g,"");
    	text = text.replace(/\n+$/g,"");

    	var grafs = text.split(/\n{2,}/g);
    	var grafsOut = new Array();

    	//
    	// Wrap <p> tags.
    	//
    	var end = grafs.length;
    	for (var i=0; i<end; i++) {
    		var str = grafs[i];

    		// if this is an HTML marker, copy it
    		if (str.search(/~K(\d+)K/g) >= 0) {
    			grafsOut.push(str);
    		}
    		else if (str.search(/\S/) >= 0) {
    			str = _RunSpanGamut(str);
    			str = str.replace(/^([ \t]*)/g,"<p>");
    			str += "</p>"
    			grafsOut.push(str);
    		}

    	}

    	//
    	// Unhashify HTML blocks
    	//
    	end = grafsOut.length;
    	for (var i=0; i<end; i++) {
    		// if this is a marker for an html block...
    		while (grafsOut[i].search(/~K(\d+)K/) >= 0) {
    			var blockText = g_html_blocks[RegExp.$1];
    			blockText = blockText.replace(/\$/g,"$$$$"); // Escape any dollar signs
    			grafsOut[i] = grafsOut[i].replace(/~K\d+K/,blockText);
    		}
    	}

    	return grafsOut.join("\n\n");
    }


    var _EncodeAmpsAndAngles = function(text) {
    // Smart processing for ampersands and angle brackets that need to be encoded.
	
    	// Ampersand-encoding based entirely on Nat Irons's Amputator MT plugin:
    	//   http://bumppo.net/projects/amputator/
    	text = text.replace(/&(?!#?[xX]?(?:[0-9a-fA-F]+|\w+);)/g,"&amp;");
	
    	// Encode naked <'s
    	text = text.replace(/<(?![a-z\/?\$!])/gi,"&lt;");
	
    	return text;
    }


    var _EncodeBackslashEscapes = function(text) {
    //
    //   Parameter:  String.
    //   Returns:	The string, with after processing the following backslash
    //			   escape sequences.
    //

    	// attacklab: The polite way to do this is with the new
    	// escapeCharacters() function:
    	//
    	// 	text = escapeCharacters(text,"\\",true);
    	// 	text = escapeCharacters(text,"`*_{}[]()>#+-.!",true);
    	//
    	// ...but we're sidestepping its use of the (slow) RegExp constructor
    	// as an optimization for Firefox.  This function gets called a LOT.

    	text = text.replace(/\\(\\)/g,escapeCharacters_callback);
    	text = text.replace(/\\([`*_{}\[\]()>#+-.!])/g,escapeCharacters_callback);
    	return text;
    }


    var _DoAutoLinks = function(text) {

    	text = text.replace(/<((https?|ftp|dict):[^'">\s]+)>/gi,"<a href=\"$1\">$1</a>");

    	// Email addresses: <address@domain.foo>

    	/*
    		text = text.replace(/
    			<
    			(?:mailto:)?
    			(
    				[-.\w]+
    				\@
    				[-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+
    			)
    			>
    		/gi, _DoAutoLinks_callback());
    	*/
    	text = text.replace(/<(?:mailto:)?([-.\w]+\@[-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+)>/gi,
    		function(wholeMatch,m1) {
    			return _EncodeEmailAddress( _UnescapeSpecialChars(m1) );
    		}
    	);

    	return text;
    }


    var _EncodeEmailAddress = function(addr) {
    //
    //  Input: an email address, e.g. "foo@example.com"
    //
    //  Output: the email address as a mailto link, with each character
    //	of the address encoded as either a decimal or hex entity, in
    //	the hopes of foiling most address harvesting spam bots. E.g.:
    //
    //	<a href="&#x6D;&#97;&#105;&#108;&#x74;&#111;:&#102;&#111;&#111;&#64;&#101;
    //	   x&#x61;&#109;&#x70;&#108;&#x65;&#x2E;&#99;&#111;&#109;">&#102;&#111;&#111;
    //	   &#64;&#101;x&#x61;&#109;&#x70;&#108;&#x65;&#x2E;&#99;&#111;&#109;</a>
    //
    //  Based on a filter by Matthew Wickline, posted to the BBEdit-Talk
    //  mailing list: <http://tinyurl.com/yu7ue>
    //

    	// attacklab: why can't javascript speak hex?
    	function char2hex(ch) {
    		var hexDigits = '0123456789ABCDEF';
    		var dec = ch.charCodeAt(0);
    		return(hexDigits.charAt(dec>>4) + hexDigits.charAt(dec&15));
    	}

    	var encode = [
    		function(ch){return "&#"+ch.charCodeAt(0)+";";},
    		function(ch){return "&#x"+char2hex(ch)+";";},
    		function(ch){return ch;}
    	];

    	addr = "mailto:" + addr;

    	addr = addr.replace(/./g, function(ch) {
    		if (ch == "@") {
    		   	// this *must* be encoded. I insist.
    			ch = encode[Math.floor(Math.random()*2)](ch);
    		} else if (ch !=":") {
    			// leave ':' alone (to spot mailto: later)
    			var r = Math.random();
    			// roughly 10% raw, 45% hex, 45% dec
    			ch =  (
    					r > .9  ?	encode[2](ch)   :
    					r > .45 ?	encode[1](ch)   :
    								encode[0](ch)
    				);
    		}
    		return ch;
    	});

    	addr = "<a href=\"" + addr + "\">" + addr + "</a>";
    	addr = addr.replace(/">.+:/g,"\">"); // strip the mailto: from the visible part

    	return addr;
    }


    var _UnescapeSpecialChars = function(text) {
    //
    // Swap back in all the special characters we've hidden.
    //
    	text = text.replace(/~E(\d+)E/g,
    		function(wholeMatch,m1) {
    			var charCodeToReplace = parseInt(m1);
    			return String.fromCharCode(charCodeToReplace);
    		}
    	);
    	return text;
    }


    var _Outdent = function(text) {
    //
    // Remove one level of line-leading tabs or spaces
    //

    	// attacklab: hack around Konqueror 3.5.4 bug:
    	// "----------bug".replace(/^-/g,"") == "bug"

    	text = text.replace(/^(\t|[ ]{1,4})/gm,"~0"); // attacklab: g_tab_width

    	// attacklab: clean up hack
    	text = text.replace(/~0/g,"")

    	return text;
    }

    var _Detab = function(text) {
    // attacklab: Detab's completely rewritten for speed.
    // In perl we could fix it by anchoring the regexp with \G.
    // In javascript we're less fortunate.

    	// expand first n-1 tabs
    	text = text.replace(/\t(?=\t)/g,"    "); // attacklab: g_tab_width

    	// replace the nth with two sentinels
    	text = text.replace(/\t/g,"~A~B");

    	// use the sentinel to anchor our regex so it doesn't explode
    	text = text.replace(/~B(.+?)~A/g,
    		function(wholeMatch,m1,m2) {
    			var leadingText = m1;
    			var numSpaces = 4 - leadingText.length % 4;  // attacklab: g_tab_width

    			// there *must* be a better way to do this:
    			for (var i=0; i<numSpaces; i++) leadingText+=" ";

    			return leadingText;
    		}
    	);

    	// clean up sentinels
    	text = text.replace(/~A/g,"    ");  // attacklab: g_tab_width
    	text = text.replace(/~B/g,"");

    	return text;
    }


    //
    //  attacklab: Utility functions
    //


    var escapeCharacters = function(text, charsToEscape, afterBackslash) {
    	// First we have to escape the escape characters so that
    	// we can build a character class out of them
    	var regexString = "([" + charsToEscape.replace(/([\[\]\\])/g,"\\$1") + "])";

    	if (afterBackslash) {
    		regexString = "\\\\" + regexString;
    	}

    	var regex = new RegExp(regexString,"g");
    	text = text.replace(regex,escapeCharacters_callback);

    	return text;
    }


    var escapeCharacters_callback = function(wholeMatch,m1) {
    	var charCodeToEscape = m1.charCodeAt(0);
    	return "~E"+charCodeToEscape+"E";
    }

    } // end of Showdown.converter
    
    return Showdown;
})();

module.exports = Showdown;
});

require.define("/models/Annotation.js", function (require, module, exports, __dirname, __filename) {
(function() {
  var Annotation, Flakey;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Flakey = require('flakey');

  Annotation = (function() {

    __extends(Annotation, Flakey.models.Model);

    function Annotation() {
      this.apply = __bind(this.apply, this);
      Annotation.__super__.constructor.apply(this, arguments);
    }

    Annotation.model_name = 'Annotation';

    Annotation.fields = ['id', 'text', 'type', 'attachment', 'document'];

    Annotation.prototype.apply = function(html) {
      var note, parts, text, _i, _len;
      parts = this.text.split('\n');
      for (_i = 0, _len = parts.length; _i < _len; _i++) {
        text = parts[_i];
        if (this.type === "note") {
          note = '<span id="note-' + this.id + '" class="' + this.type + '">' + text + '<span contenteditable="true" id="note-detail-' + this.id + '" class="note-detail">' + this.attachment + '</span></span>';
        } else {
          note = '<span id="note-' + this.id + '" class="' + this.type + '">' + text + '</span>';
        }
        html = html.replace(text, note);
      }
      return html;
    };

    return Annotation;

  })();

  module.exports = Annotation;

}).call(this);

});

require.define("/views/new_document.js", function (require, module, exports, __dirname, __filename) {
(function() {
  this.ecoTemplates || (this.ecoTemplates = {});
  this.ecoTemplates["new_document"] = function(__obj) {
    if (!__obj) __obj = {};
    var __out = [], __capture = function(callback) {
      var out = __out, result;
      __out = [];
      callback.call(this);
      result = __out.join('');
      __out = out;
      return __safe(result);
    }, __sanitize = function(value) {
      if (value && value.ecoSafe) {
        return value;
      } else if (typeof value !== 'undefined' && value != null) {
        return __escape(value);
      } else {
        return '';
      }
    }, __safe, __objSafe = __obj.safe, __escape = __obj.escape;
    __safe = __obj.safe = function(value) {
      if (value && value.ecoSafe) {
        return value;
      } else {
        if (!(typeof value !== 'undefined' && value != null)) value = '';
        var result = new String(value);
        result.ecoSafe = true;
        return result;
      }
    };
    if (!__escape) {
      __escape = __obj.escape = function(value) {
        return ('' + value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      };
    }
    (function() {
      (function() {
      
        __out.push('<div class="tool-bar-wrap">\n  <nav class="tool-bar left">\n    <div>\n      <a href="#" class="new discard">Discard Changes</a>\n      <a href="#" class="new save">Save Changes</a>\n    </div>\n  </nav>\n</div>\n\n<div class="wrap">\n  <section class="one-column">\n    <article>\n      <h1>Create a New Document</h1>\n  \n      <input type="text" id="name" name="name" placeholder="The Hitchhiker\'s Guide to the Galaxy" value="');
      
        __out.push(__sanitize(this.title));
      
        __out.push('" />\n  \n      <textarea id="new-editor" placeholder="Far out in the uncharted backwaters of the unfashionable end of the Western Spiral arm of the Galaxy lies a small unregarded yellow sun..."></textarea>\n    </article>\n  </section>\n</div>');
      
      }).call(this);
      
    }).call(__obj);
    __obj.safe = __objSafe, __obj.escape = __escape;
    return __out.join('');
  };
}).call(this);

});

require.define("/controllers/list.js", function (require, module, exports, __dirname, __filename) {
(function() {
  var $, Document, Flakey, List;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Flakey = require('flakey');

  $ = Flakey.$;

  Document = require('../models/Document');

  List = (function() {

    __extends(List, Flakey.controllers.Controller);

    function List(config) {
      this.search = __bind(this.search, this);
      this.new_document = __bind(this.new_document, this);
      this.render = __bind(this.render, this);      this.id = "list-view";
      this.class_name = "list view";
      this.actions = {
        'click .list.document': 'select_doc',
        'click .list.new_document': 'new_document',
        'keyup #search-box': 'search'
      };
      List.__super__.constructor.call(this, config);
      this.tmpl = Flakey.templates.get_template('list', require('../views/list'));
    }

    List.prototype.render = function() {
      var context, documents;
      if ((this.query_params.q != null) && this.query_params.q.length > 0) {
        documents = Document.search(this.query_params.q);
      } else {
        documents = Document.all();
      }
      context = {
        list: documents,
        query: this.query_params.q
      };
      this.html(this.tmpl.render(context));
      this.unbind_actions();
      this.bind_actions();
      return $('#search-box').val(this.query_params.q).focus();
    };

    List.prototype.new_document = function(event) {
      event.preventDefault();
      return window.location.hash = "#/new?" + (this.query_params.q != null ? Flakey.util.querystring.build({
        title: this.query_params.q
      }) : "");
    };

    List.prototype.select_doc = function(event) {
      var id;
      event.preventDefault();
      id = $(event.currentTarget).attr('id').replace('document-', '');
      return window.location.hash = "#/detail?" + Flakey.util.querystring.build({
        id: id
      });
    };

    List.prototype.search = function(event) {
      event.preventDefault();
      return Flakey.util.querystring.update({
        q: $('#search-box').val()
      }, true);
    };

    return List;

  })();

  module.exports = List;

}).call(this);

});

require.define("/views/list.js", function (require, module, exports, __dirname, __filename) {
(function() {
  this.ecoTemplates || (this.ecoTemplates = {});
  this.ecoTemplates["list"] = function(__obj) {
    if (!__obj) __obj = {};
    var __out = [], __capture = function(callback) {
      var out = __out, result;
      __out = [];
      callback.call(this);
      result = __out.join('');
      __out = out;
      return __safe(result);
    }, __sanitize = function(value) {
      if (value && value.ecoSafe) {
        return value;
      } else if (typeof value !== 'undefined' && value != null) {
        return __escape(value);
      } else {
        return '';
      }
    }, __safe, __objSafe = __obj.safe, __escape = __obj.escape;
    __safe = __obj.safe = function(value) {
      if (value && value.ecoSafe) {
        return value;
      } else {
        if (!(typeof value !== 'undefined' && value != null)) value = '';
        var result = new String(value);
        result.ecoSafe = true;
        return result;
      }
    };
    if (!__escape) {
      __escape = __obj.escape = function(value) {
        return ('' + value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      };
    }
    (function() {
      (function() {
        var doc, _i, _len, _ref;
      
        __out.push('<div class="wrap">\n  <section class="one-column">\n    <form id="search-form" action="#" method="GET">\n        <input type="text" id="search-box" name="search-box" placeholder="Search Notes" />\n    </form>\n    \n    ');
      
        _ref = this.list;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          doc = _ref[_i];
          __out.push('\n      <article class="list document" id="document-');
          __out.push(__sanitize(doc.id));
          __out.push('">\n        <section class="name"><h1>');
          __out.push(__sanitize(doc.name));
          __out.push('</h1></section>\n        <section class="content">\n          ');
          __out.push(doc.render());
          __out.push('\n        </section>\n      </article>\n    ');
        }
      
        __out.push('\n    \n    ');
      
        if (this.list.length === 0) {
          __out.push('\n    \t<article class="list new_document">\n    \t  ');
          if (this.query) {
            __out.push('\n    \t    <section class="name"><h1>New Document: ');
            __out.push(__sanitize(this.query));
            __out.push('</h1></section>\n    \t  ');
          } else {
            __out.push('\n    \t    <section class="name"><h1>New Document</h1></section>\n    \t  ');
          }
          __out.push('\n    \t</article>\n    ');
        }
      
        __out.push('\n    \n    <div class="clear"></div>\n  </section>\n</div>');
      
      }).call(this);
      
    }).call(__obj);
    __obj.safe = __objSafe, __obj.escape = __escape;
    return __out.join('');
  };
}).call(this);

});

require.define("/controllers/detail.js", function (require, module, exports, __dirname, __filename) {
(function() {
  var $, Annotation, Detail, Document, Flakey, settings, ui;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Flakey = require('flakey');

  $ = Flakey.$;

  ui = require('../lib/uikit');

  settings = require('../settings');

  Document = require('../models/Document');

  Annotation = require('../models/Annotation');

  Detail = (function() {

    __extends(Detail, Flakey.controllers.Controller);

    function Detail(config) {
      this.delete_file = __bind(this.delete_file, this);
      this.annotate = __bind(this.annotate, this);
      this.highlight = __bind(this.highlight, this);
      this["delete"] = __bind(this["delete"], this);
      this.edit_note = __bind(this.edit_note, this);
      this.edit = __bind(this.edit, this);
      this.render = __bind(this.render, this);      this.id = "detail-view";
      this.class_name = "detail view";
      this.actions = {
        'click .edit': 'edit',
        'click .highlighter': 'highlight',
        'click .annotate': 'annotate',
        'click .delete': 'delete',
        'click .delete-file': 'delete_file',
        'blur .note-detail': 'edit_note',
        'keyup ctrl+e': 'edit',
        'keyup ctrl+h': 'highlight',
        'keyup ctrl+n': 'annotate',
        'keyup ctrl+backspace': 'delete'
      };
      Detail.__super__.constructor.call(this, config);
      this.tmpl = Flakey.templates.get_template('detail', require('../views/detail'));
    }

    Detail.prototype.render = function() {
      var context;
      if (!this.query_params.id) return;
      this.doc = Document.get(this.query_params.id);
      if (!(this.doc != null)) return;
      context = {
        doc: this.doc
      };
      this.html(this.tmpl.render(context));
      this.unbind_actions();
      return this.bind_actions();
    };

    Detail.prototype.edit = function(event) {
      event.preventDefault();
      return window.location.hash = "#/edit?" + Flakey.util.querystring.build(this.query_params);
    };

    Detail.prototype.edit_note = function(event) {
      var content, id, note, target;
      event.preventDefault();
      target = $(event.target);
      id = target.attr('id').replace('note-detail-', '');
      content = target.html().replace(/\<br\/\>/, '\n\n').replace(/\<([\w\d\/]*)\>/g, ' ');
      note = Annotation.get(id);
      note.attachment = content;
      note.type = "note";
      return note.save();
    };

    Detail.prototype["delete"] = function(event) {
      var _this = this;
      event.preventDefault();
      return ui.confirm('Be careful!', 'Are you sure you want to delete this document?').show(function(ok) {
        if (ok) {
          _this.doc["delete"]();
          return window.location.hash = "#/list";
        }
      });
    };

    Detail.prototype.highlight = function(event) {
      var html, selection;
      event.preventDefault();
      selection = void 0;
      if (window.getSelection) {
        selection = window.getSelection();
      } else if (document.selection) {
        selection = document.selection.createRange();
      }
      selection = selection.toString();
      if (selection.length === 0) {
        return ui.error('Well, you were right about this being a bad idea.', 'Please select some text first.').hide(settings.growl_hide_after).effect(settings.growl_effect);
      } else {
        html = $("#detail-" + this.doc.slug).html();
        html = this.doc.annotate(selection, html);
        return $("#detail-" + this.doc.slug).html(html);
      }
    };

    Detail.prototype.annotate = function(event) {
      var html, options, selection;
      event.preventDefault();
      selection = void 0;
      if (window.getSelection) {
        selection = window.getSelection();
      } else if (document.selection) {
        selection = document.selection.createRange();
      }
      selection = selection.toString();
      if (selection.length === 0) {
        return ui.error('Well, you were right about this being a bad idea.', 'Please select some text first.').hide(settings.growl_hide_after).effect(settings.growl_effect);
      } else {
        html = $("#detail-" + this.doc.slug).html();
        options = {
          input: true,
          animate: true
        };
        html = this.doc.annotate(selection, html, "Click here to edit this note.");
        $("#detail-" + this.doc.slug).html(html);
        this.unbind_actions();
        return this.bind_actions();
      }
    };

    Detail.prototype.delete_file = function(event) {
      var _this = this;
      event.preventDefault();
      return ui.confirm('There be Monsters!', 'Are you sure you want to delete this annotation?').show(function(ok) {
        var id;
        if (ok) {
          id = $(event.target).attr('data-id');
          _this.doc.delete_file(id);
          return $(event.target).parent().slideUp();
        }
      });
    };

    return Detail;

  })();

  module.exports = Detail;

}).call(this);

});

require.define("/views/detail.js", function (require, module, exports, __dirname, __filename) {
(function() {
  this.ecoTemplates || (this.ecoTemplates = {});
  this.ecoTemplates["detail"] = function(__obj) {
    if (!__obj) __obj = {};
    var __out = [], __capture = function(callback) {
      var out = __out, result;
      __out = [];
      callback.call(this);
      result = __out.join('');
      __out = out;
      return __safe(result);
    }, __sanitize = function(value) {
      if (value && value.ecoSafe) {
        return value;
      } else if (typeof value !== 'undefined' && value != null) {
        return __escape(value);
      } else {
        return '';
      }
    }, __safe, __objSafe = __obj.safe, __escape = __obj.escape;
    __safe = __obj.safe = function(value) {
      if (value && value.ecoSafe) {
        return value;
      } else {
        if (!(typeof value !== 'undefined' && value != null)) value = '';
        var result = new String(value);
        result.ecoSafe = true;
        return result;
      }
    };
    if (!__escape) {
      __escape = __obj.escape = function(value) {
        return ('' + value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      };
    }
    (function() {
      (function() {
      
        __out.push('<div class="tool-bar-wrap">\n  <nav class="tool-bar left">\n    <div>\n      <a href="#" class="edit">Edit</a>\n      <a href="#/history?id=');
      
        __out.push(this.doc.id);
      
        __out.push('" class="">History</a>\n      <a href="#" class="delete">Delete</a>\n    </div>\n    <div>\n      <a href="#" class="highlighter">Highlight</a>\n      <a href="#" class="annotate">Create Note</a>\n    </div>\n  </nav>\n</div>\n\n<div class="wrap">\n  <section class="two-column">\n    <article id="detail-');
      
        __out.push(__sanitize(this.doc.slug));
      
        __out.push('">\n      <h1 class="name">');
      
        __out.push(__sanitize(this.doc.name));
      
        __out.push('</h1>\n      ');
      
        __out.push(this.doc.draw_annotations(this.doc.render()));
      
        __out.push('\n    </article>\n  </section>\n</div>');
      
      }).call(this);
      
    }).call(__obj);
    __obj.safe = __objSafe, __obj.escape = __escape;
    return __out.join('');
  };
}).call(this);

});

require.define("/controllers/edit.js", function (require, module, exports, __dirname, __filename) {
(function() {
  var $, Document, Edit, Flakey, autoresize, settings, ui;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Flakey = require('flakey');

  $ = Flakey.$;

  autoresize = require('../lib/autoresize');

  ui = require('../lib/uikit');

  settings = require('../settings');

  Document = require('../models/Document');

  Edit = (function() {

    __extends(Edit, Flakey.controllers.Controller);

    function Edit(config) {
      this.delete_note = __bind(this.delete_note, this);
      this.discard = __bind(this.discard, this);
      this.save = __bind(this.save, this);
      this.render = __bind(this.render, this);
      this.autosave = __bind(this.autosave, this);      this.id = "edit-view";
      this.class_name = "edit_document view";
      this.actions = {
        'click .edit.save': 'save',
        'click .edit.discard': 'discard',
        'click .edit.delete': 'delete_note',
        'keyup #edit-editor': 'autosave',
        'keyup esc #edit-editor': 'discard',
        'keyup esc': 'discard',
        'keyup ctrl+s #edit-editor': 'save',
        'keyup ctrl+s': 'save'
      };
      Edit.__super__.constructor.call(this, config);
      this.tmpl = Flakey.templates.get_template('edit', require('../views/edit'));
    }

    Edit.prototype.autosave = function(event) {
      event.preventDefault();
      if (this.doc.base_text !== $('#edit-editor').val()) {
        return localStorage[this.autosave_key()] = $('#edit-editor').val();
      }
    };

    Edit.prototype.autosave_key = function() {
      return "autosave-draft-" + this.doc.id;
    };

    Edit.prototype.close_editor = function() {
      delete localStorage[this.autosave_key()];
      return window.location.hash = "#/detail?" + Flakey.util.querystring.build({
        id: this.doc.id
      });
    };

    Edit.prototype.render = function() {
      var context;
      var _this = this;
      if (!this.query_params.id) return;
      this.doc = Document.get(this.query_params.id);
      context = {
        doc: this.doc
      };
      this.html(this.tmpl.render(context));
      if ((localStorage[this.autosave_key()] != null) && localStorage[this.autosave_key()].length > 0) {
        ui.confirm('Restore?', 'An unsaved draft of this note was found. Would you like to restore it to the editor?').show(function(ok) {
          if (ok) {
            return $('#edit-editor').val(localStorage[_this.autosave_key()]);
          } else {
            return delete localStorage[_this.autosave_key()];
          }
        });
      }
      this.unbind_actions();
      this.bind_actions();
      $('#edit-editor').autoResize({
        extraSpace: 100,
        maxHeight: 9000
      });
      return $('#edit-editor').blur().focus();
    };

    Edit.prototype.save = function(event) {
      event.preventDefault();
      this.doc.base_text = $('#edit-editor').val();
      this.doc.save();
      delete localStorage[this.autosave_key()];
      return ui.info('Everything\'s Shiny Capt\'n!', "\"" + this.doc.name + "\" was successfully saved.").hide(settings.growl_hide_after).effect(settings.growl_effect);
    };

    Edit.prototype.discard = function(event) {
      var _this = this;
      event.preventDefault();
      if (this.doc.base_text === $('#edit-editor').val()) {
        return this.close_editor();
      }
      return ui.confirm('There be Monsters!', 'Careful there Captain; are you sure you want to discard all unsaved changes to this document?').show(function(ok) {
        if (ok) return _this.close_editor();
      });
    };

    Edit.prototype.delete_note = function(event) {
      var _this = this;
      event.preventDefault();
      return ui.confirm('There be Monsters!', 'Are you sure you want to delete this annotation?').show(function(ok) {
        var id;
        if (ok) {
          id = $(event.target).parent().attr('data-id');
          _this.doc.delete_annotation(id);
          return $(event.target).parent().slideUp();
        }
      });
    };

    return Edit;

  })();

  module.exports = Edit;

}).call(this);

});

require.define("/views/edit.js", function (require, module, exports, __dirname, __filename) {
(function() {
  this.ecoTemplates || (this.ecoTemplates = {});
  this.ecoTemplates["edit"] = function(__obj) {
    if (!__obj) __obj = {};
    var __out = [], __capture = function(callback) {
      var out = __out, result;
      __out = [];
      callback.call(this);
      result = __out.join('');
      __out = out;
      return __safe(result);
    }, __sanitize = function(value) {
      if (value && value.ecoSafe) {
        return value;
      } else if (typeof value !== 'undefined' && value != null) {
        return __escape(value);
      } else {
        return '';
      }
    }, __safe, __objSafe = __obj.safe, __escape = __obj.escape;
    __safe = __obj.safe = function(value) {
      if (value && value.ecoSafe) {
        return value;
      } else {
        if (!(typeof value !== 'undefined' && value != null)) value = '';
        var result = new String(value);
        result.ecoSafe = true;
        return result;
      }
    };
    if (!__escape) {
      __escape = __obj.escape = function(value) {
        return ('' + value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      };
    }
    (function() {
      (function() {
      
        __out.push('<div class="tool-bar-wrap">\n  <nav class="tool-bar left">\n    <div>\n      <a href="#" class="edit discard">Close Editor</a>\n      <a href="#" class="edit save">Save Changes</a>\n    </div>\n  </nav>\n</div>\n\n<div class="wrap">\n  <section class="one-column">\n    <article>\n      <h1>Editing <em>');
      
        __out.push(__sanitize(this.doc.name));
      
        __out.push('</em></h1>\n      <textarea id="edit-editor" placeholder="Far out in the uncharted backwaters of the unfashionable end of the Western Spiral arm of the Galaxy lies a small unregarded yellow sun...">');
      
        __out.push(__sanitize(this.doc.base_text));
      
        __out.push('</textarea>\n    </article>\n  </section>\n</div>');
      
      }).call(this);
      
    }).call(__obj);
    __obj.safe = __objSafe, __obj.escape = __escape;
    return __out.join('');
  };
}).call(this);

});

require.define("/controllers/history.js", function (require, module, exports, __dirname, __filename) {
(function() {
  var $, Document, Flakey, History, Showdown, ui;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Flakey = require('flakey');

  $ = Flakey.$;

  ui = require('../lib/uikit');

  Showdown = require('../lib/showdown');

  Document = require('../models/Document');

  History = (function() {

    __extends(History, Flakey.controllers.Controller);

    function History(config) {
      this.update = __bind(this.update, this);
      this.rollback = __bind(this.rollback, this);
      this.render = __bind(this.render, this);      this.id = "history-view";
      this.class_name = "history view";
      this.actions = {
        'change #version-input': 'update',
        'click #rollback': 'rollback'
      };
      History.__super__.constructor.call(this, config);
      this.tmpl = Flakey.templates.get_template('history', require('../views/history'));
      Flakey.events.register('model_document_updated', this.render);
    }

    History.prototype.render = function() {
      var context, doc, latest, max_version, time;
      if (!this.query_params.id) return;
      doc = Document.get(this.query_params.id);
      max_version = doc.versions.length - 1;
      latest = doc.versions.length - 1;
      time = doc.versions[latest].time;
      context = {
        doc: doc,
        time: new Date(time),
        max_version: max_version
      };
      this.html(this.tmpl.render(context));
      this.unbind_actions();
      return this.bind_actions();
    };

    History.prototype.rollback = function(event) {
      var doc, time, version_index;
      var _this = this;
      event.preventDefault();
      version_index = $('#version-input').val();
      doc = Document.get(this.query_params.id);
      time = new Date(doc.versions[version_index].time);
      return ui.confirm('Be careful!', "Are you sure you want to rollback to the version saved at " + (time.toLocaleString())).show(function(ok) {
        if (ok) return doc.rollback(doc.versions[version_index].version_id);
      });
    };

    History.prototype.update = function(event) {
      var converter, doc, html, rev, time, version_index;
      event.preventDefault();
      version_index = $('#version-input').val();
      doc = Document.get(this.query_params.id);
      time = new Date(doc.versions[version_index].time);
      rev = doc.evolve(doc.versions[version_index].version_id);
      converter = new Showdown.converter();
      html = converter.makeHtml(rev.base_text);
      $('#history-time').html(time.toLocaleString());
      return $('#history-content').html(doc.draw_annotations(html, rev.annotations));
    };

    return History;

  })();

  module.exports = History;

}).call(this);

});

require.define("/views/history.js", function (require, module, exports, __dirname, __filename) {
(function() {
  this.ecoTemplates || (this.ecoTemplates = {});
  this.ecoTemplates["history"] = function(__obj) {
    if (!__obj) __obj = {};
    var __out = [], __capture = function(callback) {
      var out = __out, result;
      __out = [];
      callback.call(this);
      result = __out.join('');
      __out = out;
      return __safe(result);
    }, __sanitize = function(value) {
      if (value && value.ecoSafe) {
        return value;
      } else if (typeof value !== 'undefined' && value != null) {
        return __escape(value);
      } else {
        return '';
      }
    }, __safe, __objSafe = __obj.safe, __escape = __obj.escape;
    __safe = __obj.safe = function(value) {
      if (value && value.ecoSafe) {
        return value;
      } else {
        if (!(typeof value !== 'undefined' && value != null)) value = '';
        var result = new String(value);
        result.ecoSafe = true;
        return result;
      }
    };
    if (!__escape) {
      __escape = __obj.escape = function(value) {
        return ('' + value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      };
    }
    (function() {
      (function() {
        var html;
      
        __out.push('<div class="tool-bar-wrap">\n  <nav class="tool-bar left">\n    <div>\n      <a href="#/detail?id=');
      
        __out.push(this.doc.id);
      
        __out.push('">Back to Normal View</a>\n    \n      <label for="version-input">Version:</label>\n      <input type="range" min="0" max="');
      
        __out.push(__sanitize(this.max_version));
      
        __out.push('" value="');
      
        __out.push(__sanitize(this.version || this.max_version));
      
        __out.push('" step="1" id="version-input" name="version-input" />\n    \n      <a href="#" id="rollback">Rollback to this Version</a>\n    </div>\n  </nav>\n</div>\n\n<div class="wrap">\n  <section class="two-column">\n    <article id="history-');
      
        __out.push(__sanitize(this.doc.slug));
      
        __out.push('">\n      <h5>Version from <em id="history-time">');
      
        __out.push(__sanitize(this.time.toLocaleString()));
      
        __out.push('</em></h5>\n      <h1 class="name">');
      
        __out.push(__sanitize(this.doc.name));
      
        __out.push('</h1>\n      ');
      
        html = this.html != null ? this.html : this.doc.render();
      
        __out.push('\n      <section id="history-content">\n         ');
      
        __out.push(this.doc.draw_annotations(html));
      
        __out.push('\n      </section>\n    </article>\n  </section>\n</div>');
      
      }).call(this);
      
    }).call(__obj);
    __obj.safe = __objSafe, __obj.escape = __escape;
    return __out.join('');
  };
}).call(this);

});

require.define("/index.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var $, Annotare, App, Flakey, ui;
  var __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Flakey = window.Flakey = require('flakey');

  $ = window.$ = Flakey.$;

  ui = require('./lib/uikit');

  Annotare = require('./controllers/annotare');

  App = (function() {

    __extends(App, Flakey.controllers.Controller);

    function App() {
      App.__super__.constructor.apply(this, arguments);
      this.append(Annotare);
      this.actions = {
        'click #logout-user': 'logout'
      };
    }

    App.prototype.logout = function(event) {
      var url;
      event.preventDefault();
      url = $(this).attr('data-href');
      return ui.confirm('Are you sure?', 'Logging out will remove all data from this computer. It will be downloaded form the server next time you log in.').show(function(ok) {
        if (ok) {
          localStorage.clear();
          return window.location.href = url;
        }
      });
    };

    return App;

  })();

  $(document).ready(function() {
    var annotare, settings;
    settings = {
      container: $('#application'),
      base_model_endpoint: '/api'
    };
    Flakey.init(settings);
    annotare = window.Annotare = new App();
    return annotare.make_active();
  });

  module.exports = App;

}).call(this);

});
require("/index.js");
